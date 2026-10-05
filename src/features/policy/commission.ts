import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { commissionPolicies } from "@/lib/db/schema";
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
