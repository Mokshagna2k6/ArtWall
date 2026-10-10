/** Pure role policy (no DB). DB-bound actor/admin-role lookups stay in apps/web authorize.ts. */
export const ROLES = ["visitor", "artist", "staff", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Ascending authority: admin can do anything staff can, and so on. */
const RANK: Record<Role, number> = { visitor: 0, artist: 1, staff: 2, admin: 3 };

/** Default-deny: null actor or unknown role gets nothing. */
export function roleSatisfies(actual: Role | null | undefined, required: Role): boolean {
  if (!actual || !(actual in RANK)) return false;
  return RANK[actual] >= RANK[required];
}
