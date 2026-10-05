import "server-only";

import type { PoolClient } from "pg";

import { assertPaise } from "@/features/physical-wall/money";
import { inTransaction, newId, PreconditionError } from "@/features/physical-wall/actions/shared";
import { computeEscrowSplit } from "@/features/escrow/split";
import { getSql } from "@/lib/db";

export { computeEscrowSplit } from "@/features/escrow/split";

/**
 * Escrow service (BE-3.11, BE-3.12).
 *
 * Marketplace purchases do not exist yet in this codebase (no "buy this
 * artwork" action — src/features/marketplace/actions.ts is read-only
 * discovery; confirmed by grep, same finding as every prior session on this
 * project). What DOES exist is the schema (0049's escrow_holds/
 * escrow_releases, this track's own 0057 addition) and the versioned
 * commission split (0044's commission_policy_versions). This module is the
 * service layer those tables were built for: capture an amount into escrow,
 * release it to artist/platform/curator-venue per the active split only
 * after a real precondition, or refund it — with every release/refund path
 * writing pw_ledger rows that balance to exactly zero. It has no caller yet,
 * same position BE-1.19/1.20 and the PolicyEngine gates were in before a
 * later session wired them into a request path; building a fake "buy this
 * artwork" UI to give it one is out of scope.
 *
 * Double-entry convention, within pw_ledger's real schema (type is only
 * 'revenue' | 'expense' — no separate signed debit/credit column exists, and
 * adding one would touch a table with Phase 2 invariant tests). Revenue rows
 * are treated as +amount, expense rows as -amount — the same signed
 * convention getMonthlySummary already uses (netPaise = revenue - expense).
 * Under that convention:
 *
 *  - capture:  expense/escrow_hold  (-amount)  +  revenue/escrow_hold  (+amount)   = 0
 *  - release:  expense/escrow_hold  (-amount)  +  revenue/escrow_release_* per
 *              recipient, summing to +amount                                      = 0
 *  - refund:   expense/escrow_hold  (-amount)  +  revenue/escrow_refund (+amount)  = 0
 *
 * Every row from one call shares a `source_ref` prefix unique to that escrow
 * event, so "sum the rows for this transaction" is a real, checkable query —
 * exactly what the BE-3.12 test below does.
 */

export interface EscrowRecipients {
  artistUserId: string;
  /** Platform's own share has no user id — it is the house. */
  platform: true;
  /** Absent when there is no curator/venue on this transaction (0% share is valid). */
  curatorVenueUserId?: string | null;
}

export interface CaptureEscrowOptions {
  bookingId: string;
  amountPaise: number;
  reason?: string;
  /** Days before the dispute window alone makes a release eligible. Default 3 (72h). */
  disputeWindowDays?: number;
  createdBy?: string | null;
}

export interface CaptureEscrowResult {
  holdId: string;
  releaseEligibleAt: Date;
  commissionPolicyVersionId: string;
}

/** The currently-open (effective_to is null) commission split. Throws if none is configured. */
async function getOpenCommissionSplit(client: PoolClient): Promise<{
  id: string;
  platformBps: number;
  artistBps: number;
  curatorBps: number;
  venueBps: number;
  royaltyBps: number;
}> {
  const { rows } = await client.query<{
    id: string;
    platform_bps: number;
    artist_bps: number;
    curator_bps: number;
    venue_bps: number;
    royalty_bps: number;
  }>(
    `select id, platform_bps, artist_bps, curator_bps, venue_bps, royalty_bps
     from commission_policy_versions where effective_to is null limit 1`
  );
  const row = rows[0];
  if (!row) {
    throw new PreconditionError(
      "No active commission_policy_versions row. An admin must open one before escrow can price a transaction."
    );
  }
  return {
    id: row.id,
    platformBps: row.platform_bps,
    artistBps: row.artist_bps,
    curatorBps: row.curator_bps,
    venueBps: row.venue_bps,
    royaltyBps: row.royalty_bps,
  };
}

/**
 * Capture funds into escrow for a booking (BE-3.11's "funds are captured,
 * held"). Pure insert — the hold is a liability, not yet revenue, so its
 * ledger pair nets to zero rather than recognizing income.
 */
export async function captureEscrow(opts: CaptureEscrowOptions): Promise<CaptureEscrowResult> {
  assertPaise(opts.amountPaise);
  if (opts.amountPaise <= 0) throw new PreconditionError("Escrow capture amount must be positive.");
  const disputeWindowDays = opts.disputeWindowDays ?? 3;

  return inTransaction(async (client) => {
    const split = await getOpenCommissionSplit(client);
    const holdId = newId("esc");
    const ref = `escrow:${holdId}`;

    await client.query(
      `insert into escrow_holds
         (id, booking_id, amount_paise, reason, status, dispute_window_days, release_eligible_at, commission_policy_version_id)
       values ($1, $2, $3, $4, 'held', $5::integer, now() + ($5::text || ' days')::interval, $6)`,
      [holdId, opts.bookingId, opts.amountPaise, opts.reason ?? null, disputeWindowDays, split.id]
    );

    // Double-entry: the amount leaves "available" (expense) and is recorded
    // as held (revenue) — net zero, nothing recognized as real income yet.
    await insertLedgerPair(client, [
      { type: "expense", category: "escrow_hold", amountPaise: opts.amountPaise, note: `Escrow captured for booking ${opts.bookingId}`, sourceRef: `${ref}:capture:out`, bookingId: opts.bookingId, createdBy: opts.createdBy ?? null, commissionPolicyVersionId: split.id },
      { type: "revenue", category: "escrow_hold", amountPaise: opts.amountPaise, note: `Escrow captured for booking ${opts.bookingId}`, sourceRef: `${ref}:capture:in`, bookingId: opts.bookingId, createdBy: opts.createdBy ?? null, commissionPolicyVersionId: split.id },
    ]);

    const [{ release_eligible_at }] = (
      await client.query<{ release_eligible_at: Date }>(`select release_eligible_at from escrow_holds where id = $1`, [holdId])
    ).rows;

    return { holdId, releaseEligibleAt: release_eligible_at, commissionPolicyVersionId: split.id };
  });
}

interface LedgerRow {
  type: "revenue" | "expense";
  category: string;
  amountPaise: number;
  note: string;
  sourceRef: string;
  bookingId: string;
  createdBy: string | null;
  commissionPolicyVersionId: string | null;
}

async function insertLedgerPair(client: PoolClient, rows: LedgerRow[]): Promise<string[]> {
  const ids: string[] = [];
  for (const row of rows) {
    const id = newId("led");
    await client.query(
      `insert into pw_ledger (id, type, category, amount_paise, note, entry_date, source_ref, created_by, booking_id, commission_policy_version_id)
       values ($1, $2, $3, $4, $5, current_date, $6, $7, $8, $9)`,
      [id, row.type, row.category, row.amountPaise, row.note, row.sourceRef, row.createdBy, row.bookingId, row.commissionPolicyVersionId]
    );
    ids.push(id);
  }
  return ids;
}

export interface ReleaseEscrowOptions {
  holdId: string;
  recipients: EscrowRecipients;
  /** Explicit override; defaults to checking shipments.status = 'delivered' or release_eligible_at having passed. */
  deliveryConfirmed?: boolean;
  releasedBy?: string | null;
}

export interface ReleaseEscrowResult {
  ledgerIds: string[];
  releaseIds: string[];
  platformPaise: number;
  artistPaise: number;
  curatorVenuePaise: number;
}

/**
 * Release an escrow hold to artist/platform/curator-venue per the commission
 * split snapshotted at capture time (BE-3.11). Only allowed once the
 * precondition holds: delivery confirmed (a shipments row for the booking
 * reached 'delivered') OR the dispute window has passed
 * (release_eligible_at <= now()) — the Bible's literal "delivery
 * confirmation or the dispute window".
 */
export async function releaseEscrow(opts: ReleaseEscrowOptions): Promise<ReleaseEscrowResult> {
  return inTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string;
      booking_id: string;
      amount_paise: number;
      status: string;
      release_eligible_at: Date | null;
      commission_policy_version_id: string | null;
    }>(`select id, booking_id, amount_paise, status, release_eligible_at, commission_policy_version_id
        from escrow_holds where id = $1 for update`, [opts.holdId]);
    const hold = rows[0];
    if (!hold) throw new PreconditionError("No such escrow hold.");
    if (hold.status !== "held") throw new PreconditionError(`Escrow hold is already ${hold.status}.`);

    let deliveryConfirmed = opts.deliveryConfirmed ?? false;
    if (!deliveryConfirmed) {
      const shipped = await client.query(
        `select 1 from shipments where booking_id = $1 and status = 'delivered' limit 1`,
        [hold.booking_id]
      );
      deliveryConfirmed = (shipped.rowCount ?? 0) > 0;
    }
    const windowPassed = hold.release_eligible_at !== null && hold.release_eligible_at <= new Date();
    if (!deliveryConfirmed && !windowPassed) {
      throw new PreconditionError(
        "Escrow cannot be released yet: delivery is not confirmed and the dispute window has not passed."
      );
    }

    if (!hold.commission_policy_version_id) {
      throw new PreconditionError("Escrow hold has no commission policy version snapshot; cannot price the release.");
    }
    const { rows: policyRows } = await client.query<{
      platform_bps: number;
      artist_bps: number;
      curator_bps: number;
      venue_bps: number;
    }>(
      `select platform_bps, artist_bps, curator_bps, venue_bps from commission_policy_versions where id = $1`,
      [hold.commission_policy_version_id]
    );
    const policy = policyRows[0];
    if (!policy) throw new PreconditionError("Escrow hold's commission policy version no longer exists.");

    const amount = Number(hold.amount_paise);
    const hasCuratorVenue = Boolean(opts.recipients.curatorVenueUserId);
    const { platformPaise, artistPaise, curatorVenuePaise } = computeEscrowSplit(
      amount,
      { platformBps: policy.platform_bps, artistBps: policy.artist_bps, curatorBps: policy.curator_bps, venueBps: policy.venue_bps },
      hasCuratorVenue
    );

    const ref = `escrow:${opts.holdId}:release:${newId("")}`;

    // Close the hold out of the ledger's "held" bucket (expense), and
    // recognize each recipient's share as revenue — the four rows below
    // always sum to exactly zero.
    const ledgerRows: LedgerRow[] = [
      { type: "expense", category: "escrow_hold", amountPaise: amount, note: `Escrow ${opts.holdId} released`, sourceRef: `${ref}:out`, bookingId: hold.booking_id, createdBy: opts.releasedBy ?? null, commissionPolicyVersionId: hold.commission_policy_version_id },
      { type: "revenue", category: "escrow_release_platform", amountPaise: platformPaise, note: `Escrow ${opts.holdId} → platform`, sourceRef: `${ref}:platform`, bookingId: hold.booking_id, createdBy: opts.releasedBy ?? null, commissionPolicyVersionId: hold.commission_policy_version_id },
      { type: "revenue", category: "escrow_release_artist", amountPaise: artistPaise, note: `Escrow ${opts.holdId} → artist ${opts.recipients.artistUserId}`, sourceRef: `${ref}:artist`, bookingId: hold.booking_id, createdBy: opts.releasedBy ?? null, commissionPolicyVersionId: hold.commission_policy_version_id },
    ];
    if (hasCuratorVenue) {
      ledgerRows.push({
        type: "revenue",
        category: "escrow_release_curator_venue",
        amountPaise: curatorVenuePaise,
        note: `Escrow ${opts.holdId} → curator/venue ${opts.recipients.curatorVenueUserId}`,
        sourceRef: `${ref}:curator_venue`,
        bookingId: hold.booking_id,
        createdBy: opts.releasedBy ?? null,
        commissionPolicyVersionId: hold.commission_policy_version_id,
      });
    }
    // curatorVenuePaise with no curator/venue recipient is 0 by
    // computeEscrowSplit's construction, so skipping the row here never
    // drops money — nothing was allocated to it.

    const ledgerIds = await insertLedgerPair(client, ledgerRows);

    const releaseIds: string[] = [];
    const releaseTargets: { to: string; amount: number; ledgerId: string }[] = [
      { to: "platform", amount: platformPaise, ledgerId: ledgerIds[1] },
      { to: opts.recipients.artistUserId, amount: artistPaise, ledgerId: ledgerIds[2] },
    ];
    if (hasCuratorVenue) {
      releaseTargets.push({ to: opts.recipients.curatorVenueUserId!, amount: curatorVenuePaise, ledgerId: ledgerIds[3] });
    }
    for (const target of releaseTargets) {
      const releaseId = newId("escr");
      await client.query(
        `insert into escrow_releases (id, escrow_hold_id, ledger_id, amount_paise, released_to)
         values ($1, $2, $3, $4, $5)`,
        [releaseId, opts.holdId, target.ledgerId, target.amount, target.to]
      );
      releaseIds.push(releaseId);
    }

    await client.query(`update escrow_holds set status = 'released' where id = $1`, [opts.holdId]);

    return { ledgerIds, releaseIds, platformPaise, artistPaise, curatorVenuePaise };
  });
}

export interface RefundEscrowOptions {
  holdId: string;
  reason: string;
  refundedBy?: string | null;
}

export interface RefundEscrowResult {
  ledgerIds: string[];
  releaseId: string;
  amountPaise: number;
}

/**
 * Refund an escrow hold back to the payer (dispute resolved in their favor,
 * or a cancellation before delivery). No precondition on timing — a refund,
 * unlike a release, does not need delivery confirmed or the window to pass;
 * it is the path for when the sale falls through *before* either happens.
 */
export async function refundEscrow(opts: RefundEscrowOptions): Promise<RefundEscrowResult> {
  return inTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string;
      booking_id: string;
      amount_paise: number;
      status: string;
      commission_policy_version_id: string | null;
    }>(`select id, booking_id, amount_paise, status, commission_policy_version_id from escrow_holds where id = $1 for update`, [opts.holdId]);
    const hold = rows[0];
    if (!hold) throw new PreconditionError("No such escrow hold.");
    if (hold.status !== "held") throw new PreconditionError(`Escrow hold is already ${hold.status}.`);

    const amount = Number(hold.amount_paise);
    const ref = `escrow:${opts.holdId}:refund:${newId("")}`;

    const ledgerIds = await insertLedgerPair(client, [
      { type: "expense", category: "escrow_hold", amountPaise: amount, note: `Escrow ${opts.holdId} refunded: ${opts.reason}`, sourceRef: `${ref}:out`, bookingId: hold.booking_id, createdBy: opts.refundedBy ?? null, commissionPolicyVersionId: hold.commission_policy_version_id },
      { type: "revenue", category: "escrow_refund", amountPaise: amount, note: `Escrow ${opts.holdId} refunded: ${opts.reason}`, sourceRef: `${ref}:refund`, bookingId: hold.booking_id, createdBy: opts.refundedBy ?? null, commissionPolicyVersionId: hold.commission_policy_version_id },
    ]);

    const releaseId = newId("escr");
    await client.query(
      `insert into escrow_releases (id, escrow_hold_id, ledger_id, amount_paise, released_to)
       values ($1, $2, $3, $4, 'refund')`,
      [releaseId, opts.holdId, ledgerIds[1], amount]
    );

    await client.query(`update escrow_holds set status = 'refunded' where id = $1`, [opts.holdId]);

    return { ledgerIds, releaseId, amountPaise: amount };
  });
}

/** Read-only helper for callers/tests: the ledger rows written for one escrow event (by its source_ref prefix). */
export async function getEscrowLedgerRows(sourceRefPrefix: string): Promise<{ type: string; amountPaise: number }[]> {
  const sql = getSql();
  const rows = (await sql`
    select type, amount_paise from pw_ledger where source_ref like ${sourceRefPrefix + "%"}
  `) as { type: string; amount_paise: number }[];
  return rows.map((r) => ({ type: r.type, amountPaise: Number(r.amount_paise) }));
}
