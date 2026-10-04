import "server-only";

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

export const ROLES = ["visitor", "artist", "staff", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Ascending authority. `admin` can do anything `staff` can, and so on. */
const RANK: Record<Role, number> = {
  visitor: 0,
  artist: 1,
  staff: 2,
  admin: 3,
};

export interface Actor extends SessionUser {
  role: Role;
}

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
    // KB-C01: an email match alone is not proof of ownership — anyone can put
    // an admin's address in a sign-up form. Only a *verified* email (proven
    // via the auth provider) may claim the allowlisted admin identity.
    if (role !== "admin" && rows[0]?.emailVerified && isAllowlisted(user.email)) {
      await promoteToAdmin(user.id);
      return { ...user, role: "admin" };
    }
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
  if (!actor) return false;
  return RANK[actor.role] >= RANK[required];
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
 * Promote the founders named in ADMIN_EMAILS.
 *
 * Bootstrapping problem: the first admin cannot be promoted through an admin
 * screen. Rather than a seeded password or a magic user id, the allowlist is an
 * env var and promotion happens inside `getActor` - so it fires wherever the
 * actor is first resolved, including the header on the home page, rather than
 * only on an admin route the founder cannot discover until they are already an
 * admin. Demotion is not automatic - removing an email from the list does not
 * strip a role someone may have been legitimately granted since.
 */
function isAllowlisted(email: string): boolean {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

async function promoteToAdmin(userId: string): Promise<void> {
  try {
    const sql = getSql();
    const rows = (await sql`
      update "user" set role = 'admin'
      where id = ${userId} and role <> 'admin'
      returning id
    `) as { id: string }[];

    if (rows.length > 0) {
      // SEC-2.11: this IS a role grant — just allowlist-driven rather than
      // admin-driven. Lazy import: audit.ts imports the Actor *type* from this
      // module, so a static import here would be a real (if type-erased at
      // runtime) cycle — avoided the same way requireOnboardedPage avoids one.
      const { recordAudit } = await import("@/features/physical-wall/audit");
      await recordAudit({
        actor: null,
        action: "user.role-granted",
        subjectType: "user",
        subjectId: userId,
        after: { role: "admin", via: "ADMIN_EMAILS allowlist" },
      });
    }
  } catch (error) {
    console.error("[physical-wall] Could not sync admin allowlist", error);
  }
}
