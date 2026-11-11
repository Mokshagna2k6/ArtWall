import "server-only";

import { ROLES, roleSatisfies, type Role } from "@artwall/security";
import { redirect } from "next/navigation";

import { features } from "@/config/site";
import { getSessionUser, type SessionUser } from "@/lib/session";
import { getSql } from "@/lib/db";

/**
 * Role-based access for the physical wall.
 *
 * The site's other admin surface (/admin) is gated by a shared password. That
 * is fine for "hide one tile" and wrong for this: the spec requires every force
 * action, catalog edit and refund to be attributable to a *person* in
 * `pw_audit_log`, and a shared password cannot name anyone. So roles live on the
 * user row and every write here resolves an actor.
 *
 * Default-deny throughout: an unknown role gets nothing, and a route that
 * forgets to call one of these functions has no session to read at all.
 */

// Pure role policy lives in @artwall/security; re-exported so existing imports keep working.
export { ROLES, type Role };

export interface Actor extends SessionUser {
  role: Role;
}

/**
 * SEC-3.02: the named admin roles (migration 0049 + 0059, `admin_roles`).
 * This is a SECOND, additive authorization axis on top of the generic `Role`
 * above — a user still needs the generic `admin` role to reach an admin
 * surface at all (that gate is unchanged), and on top of that, specific
 * admin actions can require one of these specific roles via
 * `requireAdminRole` below. Kept as a literal union (not read from the DB at
 * type-check time) because `admin_roles` is a fixed, migration-seeded set,
 * same as `Role` above being a literal union over a column with a fixed set
 * of values.
 *
 * FE-3.18: 9 identifiers, not 8 — the Bible (Section 24) names exactly 8
 * admin roles (Super, Operations, Finance, Content, Support, Analytics, Wall
 * Network, Blockchain), but `curator_admin` has no Bible equivalent (curator
 * application review isn't one of the 8 domains) and is kept as a 9th,
 * non-Bible role rather than folded into content_admin/operations_admin and
 * silently changing what existing curator_admin grants can do. Same
 * reasoning for `compliance_admin` (identity/KYC review). See migration
 * 0059's header for the full per-role rename/mapping decision, and
 * `BIBLE_ROLES`/`ROLE_DISPLAY_NAMES` below for how the two non-Bible roles
 * surface in the admin nav shell (as links inside a Bible role's landing
 * page, not as their own top-level tile). `readonly_admin` was renamed to
 * `analytics_admin` by 0059 (a real data migration on the existing row, not
 * just a label swap) to match the Bible's "Analytics Admin"; `venue_admin`
 * keeps its identifier (only its UI label becomes "Wall Network Admin" —
 * renaming the identifier itself would touch every wallos/actions.ts call
 * site and *.db.test.ts fixture that already writes `venue_admin`, for a
 * change that is cosmetic everywhere else); `operations_admin` and
 * `blockchain_admin` are brand new in 0059, with no prior equivalent.
 */
export const ADMIN_ROLES = [
  "super_admin",
  "operations_admin",
  "finance_admin",
  "content_admin",
  "support_admin",
  "analytics_admin",
  "venue_admin",
  "blockchain_admin",
  "curator_admin",
  "compliance_admin",
] as const;
export type AdminRoleName = (typeof ADMIN_ROLES)[number];

/**
 * FE-3.18: the Bible's exact 8 roles, in the Bible's own order, each paired
 * with the display label the admin nav shell renders. This is what the nav
 * shell iterates to always show all 8 tiles regardless of what the viewer
 * holds — `curator_admin` and `compliance_admin` are deliberately absent
 * (not Bible roles; see `ADMIN_ROLES`'s comment above) and surface instead
 * as a link inside the Content Admin / Operations Admin landing page.
 */
export const BIBLE_ROLES: readonly { role: AdminRoleName; label: string }[] = [
  { role: "super_admin", label: "Super Admin" },
  { role: "operations_admin", label: "Operations Admin" },
  { role: "finance_admin", label: "Finance Admin" },
  { role: "content_admin", label: "Content Admin" },
  { role: "support_admin", label: "Support Admin" },
  { role: "analytics_admin", label: "Analytics Admin" },
  { role: "venue_admin", label: "Wall Network Admin" },
  { role: "blockchain_admin", label: "Blockchain Admin" },
];

/** Display label for any of the 10 stored role identifiers, Bible or not. */
export const ROLE_DISPLAY_NAMES: Record<AdminRoleName, string> = {
  super_admin: "Super Admin",
  operations_admin: "Operations Admin",
  finance_admin: "Finance Admin",
  content_admin: "Content Admin",
  support_admin: "Support Admin",
  analytics_admin: "Analytics Admin",
  venue_admin: "Wall Network Admin",
  blockchain_admin: "Blockchain Admin",
  curator_admin: "Curator Admin (non-Bible)",
  compliance_admin: "Compliance Admin (non-Bible)",
};

export class NotAuthorisedError extends Error {
  readonly status = 403;
  constructor(required: Role) {
    super(`This action needs ${required} access.`);
    this.name = "NotAuthorisedError";
  }
}

/**
 * SEC-1.13: while `PHYSICAL_WALL_ENABLED` is off, the page layout hides every
 * route with `notFound()` — but a server action or an `/api/physical-wall/*`
 * route handler is not a page and is never gated by a layout, so it stays
 * reachable by anyone who calls it directly. Same "invisible, not merely
 * inaccessible" status (404) as the layout, so a disabled feature does not
 * even confirm its own existence.
 */
export class PhysicalWallDisabledError extends Error {
  readonly status = 404;
  constructor() {
    super("Not found.");
    this.name = "PhysicalWallDisabledError";
  }
}

/**
 * Call first, before any other work, in every physical-wall server action and
 * every `/api/physical-wall/*` route handler — the layout's `notFound()` only
 * covers pages, not these. `requireRole`/`getActor` call this too, so anything
 * that already checks a role gets it for free; call it directly in the few
 * actions and routes that do not (public search, QR scans, webhooks, …).
 */
export function requirePhysicalWallEnabled(): void {
  if (!features.physicalWall) throw new PhysicalWallDisabledError();
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * The signed-in user with their role, or null.
 *
 * The role is read fresh from the database rather than carried in the session:
 * revoking someone's staff access has to take effect on their next action, not
 * whenever their cookie happens to expire.
 */
export async function getActor(): Promise<Actor | null> {
  const user = await getSessionUser();
  if (!user) return null;

  try {
    const sql = getSql();
    const rows = (await sql`
      select role, "emailVerified" from "user" where id = ${user.id} limit 1
    `) as { role: string; emailVerified: boolean }[];

    const role = rows[0]?.role;
    return { ...user, role: isRole(role) ? role : "artist" };
  } catch (error) {
    // An unreadable role must not be an *escalated* role. Falling back to the
    // lowest privilege means a database blip locks people out rather than
    // letting them in.
    console.error("[physical-wall] Could not read role", error);
    return { ...user, role: "visitor" };
  }
}

export function hasRole(actor: Actor | null, required: Role): boolean {
  return roleSatisfies(actor?.role, required);
}

/**
 * Require a role in a **page**, redirecting if the visitor lacks it.
 *
 * Signed-out visitors go to sign-in and come back. Signed-in users who simply
 * do not have the role are sent to the public wall — telling them "you are not
 * an admin" would confirm the route exists, and there is nothing they can do
 * with that.
 */
export async function requireRolePage(
  required: Role,
  returnTo: string
): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`);
  }
  if (!hasRole(actor, required)) {
    redirect("/physical-wall");
  }
  return actor;
}

/**
 * Require a role **and** finished onboarding, for pages that process data.
 *
 * Separate from `requireRolePage` because the welcome page itself needs the
 * role check without the onboarding check — gating it on its own completion
 * would be a redirect loop.
 *
 * Used by anything that acts on personal data (booking, the account page,
 * bookings list). Browsing the public wall never hits this: consent is required
 * to *process*, not to look.
 */
export async function requireOnboardedPage(
  required: Role,
  returnTo: string
): Promise<Actor> {
  const actor = await requireRolePage(required, returnTo);

  // Imported lazily: data/consent.ts imports from here for its own types, and
  // a top-level import would close the cycle.
  const { needsOnboarding } = await import(
    "@/features/physical-wall/data/consent"
  );

  if (await needsOnboarding(actor.id)) {
    redirect(`/physical-wall/welcome?next=${encodeURIComponent(returnTo)}`);
  }
  return actor;
}

/**
 * Require a role in a **server action**, throwing if the caller lacks it.
 *
 * Actions return a result object rather than redirecting, so this throws and
 * the action's own try/catch turns it into a message. Every mutating action in
 * this feature calls this first — it is what makes the audit log's actor_id
 * trustworthy.
 */
export async function requireRole(required: Role): Promise<Actor> {
  requirePhysicalWallEnabled();
  const actor = await getActor();
  if (!hasRole(actor, required)) throw new NotAuthorisedError(required);
  return actor as Actor;
}

/**
 * SEC-3.02/SEC-3.03: does this actor currently hold the named admin role?
 *
 * `super_admin` always passes, regardless of `required` — FE-3.17/FE-3.18:
 * "for super admin everything would be the same as the Bible," i.e. the top
 * role's experience never narrows just because a newer, more specific role
 * check gets added somewhere. `requireAnyAdminRolePage` already had this
 * bypass; it belongs here too so the same guarantee holds for every server
 * action gated by `requireAdminRole` (below), not just pages. Checked before
 * the query below runs the actual lookup, not after, as a true short-circuit.
 *
 * Reads `admin_role_assignments` live (same "no caching, revocation takes
 * effect immediately" reasoning as `getActor`'s role read above) for a row
 * with this user, this role, not revoked. `admin_roles.name` is the human
 * name (e.g. "compliance_admin"); `admin_role_assignments.role_id` stores the
 * `admin_roles.id` foreign key, so the check joins through it.
 */
export async function hasAdminRole(
  actor: Actor | null,
  required: AdminRoleName
): Promise<boolean> {
  if (!actor) return false;
  try {
    const sql = getSql();
    const rows = (await sql`
      select 1 from admin_role_assignments a
      join admin_roles r on r.id = a.role_id
      where a.user_id = ${actor.id}
        and (r.name = ${required} or r.name = 'super_admin')
        and a.revoked_at is null
      limit 1
    `) as unknown[];
    return rows.length > 0;
  } catch (error) {
    console.error("[physical-wall] Could not read admin role assignment", error);
    return false;
  }
}

/**
 * Require a *specific* named admin role (one of the 8 in `ADMIN_ROLES`) in a
 * server action, throwing if the caller lacks it.
 *
 * This is additional to, not a replacement for, `requireRole("admin")`: it
 * still requires the caller to be a generic `admin` first (the existing,
 * proven gate every admin surface already relies on), and on top of that
 * requires the specific granted role. New/stricter admin actions that map
 * cleanly onto one of the 8 Bible roles should call this; the broad
 * `requireRole("admin")` remains the catch-all for everything else — see
 * docs/architecture/policy-engine.md's "Admin roles" section for the scope reasoning.
 */
export async function requireAdminRole(required: AdminRoleName): Promise<Actor> {
  const actor = await requireRole("admin");
  if (!(await hasAdminRole(actor, required))) throw new NotAuthorisedAdminRoleError(required);
  return actor;
}

/**
 * FE-3.17: every named admin role this actor currently holds (live,
 * unrevoked rows only — same "no caching" reasoning as `hasAdminRole`). Used
 * to decide which admin-console sections to show/allow, where a single
 * `hasAdminRole` check per role would mean one query per section per page
 * render instead of one query total.
 */
export async function listOwnAdminRoles(actor: Actor | null): Promise<AdminRoleName[]> {
  if (!actor) return [];
  try {
    const sql = getSql();
    const rows = (await sql`
      select r.name from admin_role_assignments a
      join admin_roles r on r.id = a.role_id
      where a.user_id = ${actor.id} and a.revoked_at is null
    `) as { name: string }[];
    return rows.map((r) => r.name).filter((n): n is AdminRoleName =>
      (ADMIN_ROLES as readonly string[]).includes(n)
    );
  } catch (error) {
    console.error("[physical-wall] Could not read admin role assignments", error);
    return [];
  }
}

/**
 * Require *any one* of a set of named admin roles in a **page**, redirecting
 * if the caller holds none of them. `super_admin` is always accepted
 * (FE-3.17: the top role sees everything) even if it is not in `allowed`.
 *
 * Same "signed out -> sign in, signed in but lacking role -> public wall"
 * behaviour as `requireRolePage`, since confirming a gated admin section
 * exists to someone who can't reach it is not useful to them.
 */
export async function requireAnyAdminRolePage(
  allowed: readonly AdminRoleName[],
  returnTo: string
): Promise<Actor> {
  const actor = await requireRolePage("admin", returnTo);
  const held = await listOwnAdminRoles(actor);
  const ok = held.includes("super_admin") || allowed.some((role) => held.includes(role));
  if (!ok) redirect("/physical-wall/admin");
  return actor;
}

export class NotAuthorisedAdminRoleError extends Error {
  readonly status = 403;
  constructor(required: AdminRoleName) {
    super(`This action needs the ${required} admin role.`);
    this.name = "NotAuthorisedAdminRoleError";
  }
}

/* ── Venue-scoped WallOS roles (0081, Bible §13/§35) ─────────────────────────
 *
 * A FOURTH authorization axis, and the reason it is not folded into
 * `AdminRoleName` above is the whole point of it: `admin_role_assignments` is
 * global, so a row there grants a role across every venue on the platform.
 * Bible §13 gives a Wall Manager access to *specific assigned venues*, and a
 * Wall Consultant is an **external** advisor — neither should touch the
 * internal admin axis (granting one of those also sets `user.role = 'admin'`).
 * So these grants live in `venue_role_assignments`, one row per venue, and
 * every check below takes a `venueId`. There is deliberately no "does this
 * user hold this role anywhere" helper: that is exactly the mis-grant this
 * design exists to prevent.
 *
 * Locked Rule 34 (Wall Manager != Venue Owner) and Rule 35 (Wall Consultant
 * != Wall Manager) are enforced by never treating one role as satisfying a
 * check for the other — `hasVenueRole` compares the stored role exactly, and
 * unlike `hasAdminRole` there is no `super_admin` bypass, because a platform
 * admin is not a party to a venue's own staffing. Admin surfaces keep using
 * `requireAdminRole("venue_admin")`; these are for the venue-side actors.
 */
export const VENUE_ROLES = ["wall_manager", "wall_consultant"] as const;
export type VenueRoleName = (typeof VENUE_ROLES)[number];

export const VENUE_ROLE_DISPLAY_NAMES: Record<VenueRoleName, string> = {
  wall_manager: "Wall Manager",
  wall_consultant: "Wall Consultant",
};

export class NotAuthorisedVenueRoleError extends Error {
  readonly status = 403;
  readonly venueId: string;
  constructor(required: VenueRoleName, venueId: string) {
    super(`This action needs the ${VENUE_ROLE_DISPLAY_NAMES[required]} role on this venue.`);
    this.name = "NotAuthorisedVenueRoleError";
    this.venueId = venueId;
  }
}

/**
 * Does this actor hold `required` on *this one venue*, right now?
 *
 * Read live (same "revocation takes effect on the next action" reasoning as
 * `hasAdminRole`), and fail-closed on a database error.
 */
export async function hasVenueRole(
  actor: Actor | null,
  venueId: string,
  required: VenueRoleName
): Promise<boolean> {
  if (!actor || !venueId) return false;
  try {
    const sql = getSql();
    const rows = (await sql`
      select 1 from venue_role_assignments
      where user_id = ${actor.id}
        and venue_id = ${venueId}
        and role = ${required}
        and revoked_at is null
      limit 1
    `) as unknown[];
    return rows.length > 0;
  } catch (error) {
    console.error("[physical-wall] Could not read venue role assignment", error);
    return false;
  }
}

/**
 * Every venue this actor holds `role` on (Bible §13's "one or more venues").
 * Used to scope a list query — `where venue_id = any($1)` — instead of
 * fetching everything and filtering per row.
 */
export async function listOwnVenues(
  actor: Actor | null,
  role: VenueRoleName
): Promise<string[]> {
  if (!actor) return [];
  try {
    const sql = getSql();
    const rows = (await sql`
      select venue_id from venue_role_assignments
      where user_id = ${actor.id} and role = ${role} and revoked_at is null
    `) as { venue_id: string }[];
    return rows.map((r) => r.venue_id);
  } catch (error) {
    console.error("[physical-wall] Could not read venue role assignments", error);
    return [];
  }
}

/**
 * Require a venue-scoped role in a **server action**, throwing if the caller
 * lacks it on that venue. Only `artist` is required generically (i.e. just a
 * signed-in, real user): the venue grant itself is the authorization, and
 * requiring `staff`/`admin` on top would make the role unusable by the
 * venue-side and external people it exists for.
 */
export async function requireVenueRole(
  venueId: string,
  required: VenueRoleName
): Promise<Actor> {
  const actor = await requireRole("artist");
  if (!(await hasVenueRole(actor, venueId, required))) {
    throw new NotAuthorisedVenueRoleError(required, venueId);
  }
  return actor;
}

/**
 * Require a venue-scoped role in a **page**. Same "signed out -> sign in,
 * signed in but not granted -> public wall" behaviour as `requireRolePage`.
 */
export async function requireVenueRolePage(
  venueId: string,
  required: VenueRoleName,
  returnTo: string
): Promise<Actor> {
  const actor = await requireRolePage("artist", returnTo);
  if (!(await hasVenueRole(actor, venueId, required))) redirect("/physical-wall");
  return actor;
}
