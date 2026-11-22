import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { captureEscrow, getEscrowLedgerRows, refundEscrow, releaseEscrow } from "@/features/escrow/service";
import { makeBooking, makeSlots, makeUser, purgeTestData, q, tid } from "@/test/fixtures";

/**
 * BE-3.11/3.12: the escrow service, end to end against a real database.
 *
 * Proves three things no source read can prove on its own:
 *  1. a release/refund cannot happen before delivery confirmation or the
 *     dispute window (BE-3.11's actual precondition);
 *  2. the ledger rows a capture/release/refund writes, SUMMED FOR REAL out of
 *     the database (not reasoned about from the code), net to exactly zero
 *     (BE-3.12);
 *  3. escrow_releases rows for a hold sum to exactly the hold amount, which
 *     the escrow_releases_within_hold trigger (0049) would reject otherwise
 *     — so passing this test also proves the trigger didn't block anything.
 */
describe("escrow service (BE-3.11, BE-3.12)", () => {
  let testPolicyId: string;
  let previousOpenId: string | null;

  beforeEach(async () => {
    // Open a known test split (50% platform / 30% artist / 20% curator) and
    // close out whatever was already open, same pattern as
    // commission-policy-versions.db.test.ts. Restored in afterEach.
    const [open] = await q<{ id: string }>(
      `select id from commission_policy_versions where effective_to is null`
    );
    previousOpenId = open?.id ?? null;
    if (previousOpenId) {
      await q(`update commission_policy_versions set effective_to = now() where id = $1`, [previousOpenId]);
    }
    testPolicyId = tid("cpv");
    await q(
      `insert into commission_policy_versions (id, version, platform_bps, artist_bps, curator_bps, venue_bps, royalty_bps)
       values ($1, (select coalesce(max(version), 0) + 1 from commission_policy_versions), 5000, 3000, 2000, 0, 0)`,
      [testPolicyId]
    );
  });

  afterEach(async () => {
    await q(`update commission_policy_versions set effective_to = now() where id = $1`, [testPolicyId]);
    if (previousOpenId) {
      await q(`update commission_policy_versions set effective_to = null where id = $1`, [previousOpenId]);
    }
  });

  afterAll(purgeTestData);

  async function makeTestBooking() {
    const artist = await makeUser("artist");
    const slots = await makeSlots(1);
    const bookingId = await makeBooking(artist.id, slots, { status: "paid", totalPaise: 100_000 });
    return { artistId: artist.id, bookingId };
  }

  it("captures a hold whose ledger pair nets to zero", async () => {
    const { bookingId } = await makeTestBooking();
    const { holdId, commissionPolicyVersionId } = await captureEscrow({ bookingId, amountPaise: 100_000 });
    expect(commissionPolicyVersionId).toBe(testPolicyId);

    const rows = await getEscrowLedgerRows(`escrow:${holdId}:capture`);
    expect(rows).toHaveLength(2);
    const sum = rows.reduce((s, r) => s + (r.type === "revenue" ? r.amountPaise : -r.amountPaise), 0);
    expect(sum).toBe(0);

    const [hold] = await q<{ status: string; release_eligible_at: Date }>(
      `select status, release_eligible_at from escrow_holds where id = $1`,
      [holdId]
    );
    expect(hold.status).toBe("held");
    expect(new Date(hold.release_eligible_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses to release before delivery confirmation or the dispute window", async () => {
    const { bookingId, artistId } = await makeTestBooking();
    const { holdId } = await captureEscrow({ bookingId, amountPaise: 100_000 });

    await expect(
      releaseEscrow({ holdId, recipients: { artistUserId: artistId, platform: true } })
    ).rejects.toThrow(/cannot be released yet/);

    // The hold must still be untouched — no partial release on a rejected call.
    const [hold] = await q<{ status: string }>(`select status from escrow_holds where id = $1`, [holdId]);
    expect(hold.status).toBe("held");
  });

  it("releases once delivery is confirmed, splitting platform/artist/curator and balancing to zero", async () => {
    const { bookingId, artistId } = await makeTestBooking();
    const curator = await makeUser("artist"); // stand-in user id for the curator/venue recipient
    const { holdId } = await captureEscrow({ bookingId, amountPaise: 100_000 });

    const result = await releaseEscrow({
      holdId,
      recipients: { artistUserId: artistId, platform: true, curatorVenueUserId: curator.id },
      deliveryConfirmed: true,
    });

    expect(result.platformPaise).toBe(50_000);
    expect(result.curatorVenuePaise).toBe(20_000);
    expect(result.artistPaise).toBe(30_000);
    expect(result.platformPaise + result.artistPaise + result.curatorVenuePaise).toBe(100_000);

    // The real, decisive check: sum every ledger row this release actually
    // wrote, read back from Postgres, and prove it is exactly zero.
    const rows = await getEscrowLedgerRows(`escrow:${holdId}:release`);
    expect(rows.length).toBeGreaterThanOrEqual(4); // 1 expense (close hold) + 3 revenue (platform/artist/curator)
    const sum = rows.reduce((s, r) => s + (r.type === "revenue" ? r.amountPaise : -r.amountPaise), 0);
    expect(sum).toBe(0);

    // escrow_releases rows sum to exactly the hold amount (proves the
    // escrow_releases_within_hold trigger didn't need to reject anything,
    // and that nothing was double-counted or dropped).
    const [{ total }] = await q<{ total: string }>(
      `select coalesce(sum(amount_paise), 0)::bigint as total from escrow_releases where escrow_hold_id = $1`,
      [holdId]
    );
    expect(Number(total)).toBe(100_000);

    const [hold] = await q<{ status: string }>(`select status from escrow_holds where id = $1`, [holdId]);
    expect(hold.status).toBe("released");
  });

  it("releases with no curator/venue — curator's share folds into the artist, still balances to zero", async () => {
    const { bookingId, artistId } = await makeTestBooking();
    const { holdId } = await captureEscrow({ bookingId, amountPaise: 100_000 });

    const result = await releaseEscrow({
      holdId,
      recipients: { artistUserId: artistId, platform: true },
      deliveryConfirmed: true,
    });

    expect(result.curatorVenuePaise).toBe(0);
    expect(result.platformPaise).toBe(50_000);
    expect(result.artistPaise).toBe(50_000); // 30% own + 20% curator's folded-in share

    const rows = await getEscrowLedgerRows(`escrow:${holdId}:release`);
    // No curator row is written at all when there is no curator/venue.
    expect(rows.some((r) => r.amountPaise === 0)).toBe(false);
    const sum = rows.reduce((s, r) => s + (r.type === "revenue" ? r.amountPaise : -r.amountPaise), 0);
    expect(sum).toBe(0);
  });

  it("releases once the dispute window has passed, with no delivery confirmation", async () => {
    const { bookingId, artistId } = await makeTestBooking();
    const { holdId } = await captureEscrow({ bookingId, amountPaise: 100_000, disputeWindowDays: 3 });

    // Force the window into the past, same as time having actually elapsed.
    await q(`update escrow_holds set release_eligible_at = now() - interval '1 minute' where id = $1`, [holdId]);

    const result = await releaseEscrow({ holdId, recipients: { artistUserId: artistId, platform: true } });
    expect(result.platformPaise + result.artistPaise + result.curatorVenuePaise).toBe(100_000);

    const rows = await getEscrowLedgerRows(`escrow:${holdId}:release`);
    const sum = rows.reduce((s, r) => s + (r.type === "revenue" ? r.amountPaise : -r.amountPaise), 0);
    expect(sum).toBe(0);
  });

  it("refunds an escrow hold with a balanced ledger pair, no precondition required", async () => {
    const { bookingId } = await makeTestBooking();
    const { holdId } = await captureEscrow({ bookingId, amountPaise: 100_000 });

    const result = await refundEscrow({ holdId, reason: "Buyer disputed before delivery" });
    expect(result.amountPaise).toBe(100_000);

    const rows = await getEscrowLedgerRows(`escrow:${holdId}:refund`);
    expect(rows).toHaveLength(2);
    const sum = rows.reduce((s, r) => s + (r.type === "revenue" ? r.amountPaise : -r.amountPaise), 0);
    expect(sum).toBe(0);

    const [hold] = await q<{ status: string }>(`select status from escrow_holds where id = $1`, [holdId]);
    expect(hold.status).toBe("refunded");
  });

  it("refuses to release or refund an already-released hold", async () => {
    const { bookingId, artistId } = await makeTestBooking();
    const { holdId } = await captureEscrow({ bookingId, amountPaise: 100_000 });
    await releaseEscrow({ holdId, recipients: { artistUserId: artistId, platform: true }, deliveryConfirmed: true });

    await expect(
      releaseEscrow({ holdId, recipients: { artistUserId: artistId, platform: true }, deliveryConfirmed: true })
    ).rejects.toThrow(/already released/);
    await expect(refundEscrow({ holdId, reason: "double spend attempt" })).rejects.toThrow(/already released/);
  });

  it("the full capture+release transaction's ledger rows together sum to zero", async () => {
    // Not just the release in isolation — everything this one escrow event
    // ever wrote to pw_ledger, summed in one query, is zero.
    const { bookingId, artistId } = await makeTestBooking();
    const { holdId } = await captureEscrow({ bookingId, amountPaise: 73_219 }); // odd amount: exercises rounding too
    await releaseEscrow({ holdId, recipients: { artistUserId: artistId, platform: true }, deliveryConfirmed: true });

    const rows = await getEscrowLedgerRows(`escrow:${holdId}`);
    const sum = rows.reduce((s, r) => s + (r.type === "revenue" ? r.amountPaise : -r.amountPaise), 0);
    expect(sum).toBe(0);
  });
});
