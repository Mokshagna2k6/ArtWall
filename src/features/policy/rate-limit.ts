import "server-only";

import { limitRequest, retryIn, type RateLimitResult } from "@/lib/rate-limit";

/**
 * Rate limits for the PolicyEngine-gated high-value operations (PERF-3.03):
 * mint, list, secondary sell. Reuses the persistent limiter from
 * `src/lib/rate-limit.ts` (Postgres-backed, fail-closed by default) — no new
 * mechanism.
 *
 * These are deliberately NOT wired into a call site yet: no route or action in
 * this codebase invokes `canMint`/`canList`/`canSecondarySell` for real (see
 * "What's not done" in docs/policy-engine.md, BE-3.03). `limitPolicyOperation`
 * is what that wiring should call once it exists — same shape as every other
 * rate-limited action in this codebase (`limitRequest` + `retryIn`).
 *
 * Per-role limits: staff/admin act on behalf of many artists (bulk curation,
 * support), so they get a higher ceiling than an individual artist self-service
 * call. All three operations write money-adjacent state (a mint, a listing, a
 * sale), so none of them fail open — an outage should block the action, not
 * silently allow unlimited mints/listings while we can't count them.
 */

export type PolicyOperation = "mint" | "list" | "secondarySell";
export type PolicyActorRole = "visitor" | "artist" | "staff" | "admin";

const RULES: Record<PolicyOperation, Record<PolicyActorRole, { limit: number; windowMs: number }>> = {
  mint: {
    visitor: { limit: 0, windowMs: 60 * 60 * 1000 }, // visitors cannot mint
    artist: { limit: 10, windowMs: 60 * 60 * 1000 },
    staff: { limit: 50, windowMs: 60 * 60 * 1000 },
    admin: { limit: 50, windowMs: 60 * 60 * 1000 },
  },
  list: {
    visitor: { limit: 0, windowMs: 60 * 60 * 1000 },
    artist: { limit: 20, windowMs: 60 * 60 * 1000 },
    staff: { limit: 100, windowMs: 60 * 60 * 1000 },
    admin: { limit: 100, windowMs: 60 * 60 * 1000 },
  },
  secondarySell: {
    visitor: { limit: 0, windowMs: 60 * 60 * 1000 },
    artist: { limit: 20, windowMs: 60 * 60 * 1000 },
    staff: { limit: 100, windowMs: 60 * 60 * 1000 },
    admin: { limit: 100, windowMs: 60 * 60 * 1000 },
  },
};

/**
 * Count one attempt at a PolicyEngine-gated operation for `userId` (already
 * resolved role) and report whether it's within the per-role limit. Fails
 * closed: these are all money-adjacent writes (see module doc).
 *
 * Call this BEFORE the gate/DB work, same position `limitRequest` is called
 * at every other rate-limited call site in this codebase (`upload/actions.ts`,
 * `admin/actions.ts`).
 */
export async function limitPolicyOperation(
  op: PolicyOperation,
  role: PolicyActorRole,
  userId: string,
  h?: Headers
): Promise<RateLimitResult> {
  return limitRequest(`policy:${op}`, RULES[op][role], userId, h);
}

export { retryIn };
