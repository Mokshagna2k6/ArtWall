import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { commissionPolicies } from "@/lib/db/schema";
import { applyBp } from "@/features/physical-wall/money";
import { PreconditionError } from "@/features/physical-wall/actions/shared";

/**
 * commission_policies reader (BE-3.09, BE-3.10).
 *
 * Replaces the interim CURATOR_COMMISSION_BPS / MINT_ROYALTY_BPS env vars:
 * no commission, royalty or curator percentage may be a literal in src.
 * Every transaction-time calculation reads the row `active` for its `kind`
 * right now and stores that row's `id` on the ledger entry it produces
 * (BE-3.09) — never the bare bps number — so a later rate change can never
 * silently re-price a transaction that already happened.
 */

/**
 * "venue_revenue_share" (BC-3.14): the venue's cut of a physical-wall slot
 * booking, recorded the same way every other rate in this table is —
 * versioned, one active row, no literal bps anywhere in src. BC-3.14 also
 * asks for "WallOS slot IDs registered on-chain"; no WallOS hierarchy
 * tables exist in this codebase today (checked: no pw_slots chain-ref
 * column, no on-chain registration anywhere in Phase 1/2/3's work), and
 * every other on-chain surface in this codebase (ArtwallCOA, mint_commitments)
 * is scoped to the *artwork*, never to a physical wall slot — consistent
 * with BE-3.14's own scope interpretation (docs/policy-engine.md), on-chain
 * slot IDs are treated as Growth-phase / N/A for MVP; only the revenue-share
 * rate itself is implemented here.
 */
export type CommissionKind = "curator_commission" | "mint_royalty" | "platform_commission" | "venue_revenue_share";

export interface ActiveCommissionPolicy {
  id: string;
  rateBps: number;
}

/** Throws if no policy is active for `kind` — an unconfigured rate must refuse, not default. */
export async function getActiveCommissionPolicy(
  kind: CommissionKind
): Promise<ActiveCommissionPolicy> {
  const [row] = await db
    .select({ id: commissionPolicies.id, rateBps: commissionPolicies.rateBps })
    .from(commissionPolicies)
    .where(and(eq(commissionPolicies.kind, kind), eq(commissionPolicies.active, true)))
    .orderBy(desc(commissionPolicies.createdAt))
    .limit(1);

  if (!row) {
    throw new PreconditionError(
      `No active commission policy for "${kind}". An admin must set one before this can proceed.`
    );
  }
  return row;
}

/**
 * BE-3.14: the venue's cut of a transaction, in paise. Reads the active
 * "venue_revenue_share" rate (never a literal in src) and applies it with
 * the same integer basis-point math every other money path on the physical
 * wall uses (`applyBp` — round half-up, no float). `venueId` is accepted but
 * not yet used to pick a per-venue rate: one active row covers every venue
 * today (0055 seeds a single kind, not one row per venue), same scope as
 * every other commission kind in this table. A later per-venue override
 * would key off this argument without changing the signature.
 */
export async function computeVenueRevenueShare(
  venueId: string,
  transactionAmountPaise: number
): Promise<{ policyId: string; rateBps: number; shareAmountPaise: number }> {
  if (!venueId.trim()) throw new PreconditionError("Which venue?");
  const policy = await getActiveCommissionPolicy("venue_revenue_share");
  return {
    policyId: policy.id,
    rateBps: policy.rateBps,
    shareAmountPaise: applyBp(transactionAmountPaise, policy.rateBps),
  };
}
