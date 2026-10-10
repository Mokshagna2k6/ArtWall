"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/features/physical-wall/audit";
import {
  ADMIN_ROLES,
  requireAdminRole,
  type AdminRoleName,
} from "@/features/physical-wall/authorize";
import type { ActionState } from "@/features/physical-wall/action-state";
import {
  attempt,
  fail,
  formInput,
  newId,
  ok,
  parseInput,
  PreconditionError,
  readSafely,
  type Result,
} from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

/**
 * SEC-3.03: grant/revoke for the 8 named admin roles (`admin_role_assignments`,
 * migration 0049). Both actions require the CALLER to already hold
 * `super_admin` — the only role allowed to manage other admins' roles — and
 * self-grant is rejected outright so an admin can never hand themselves a
 * stronger role than the one they were actually given.
 *
 * Append-only by schema (0049's `admin_role_assignments_no_mutate` trigger):
 * a revoke is a new row's `revoked_by`/`revoked_at` set on the live
 * assignment, never a delete — matching `pw_consents` and
 * `commission_policy_versions`'s existing close-out-don't-delete pattern.
 */

const roleNameSchema = z.enum(ADMIN_ROLES, { error: "Not a recognised admin role." });
const grantSchema = z.object({
  targetUserId: z.string().trim().min(1, "Pick a user.").max(64),
  role: roleNameSchema,
});

export async function grantAdminRole(
  targetUserId: string,
  role: AdminRoleName
): Promise<Result<{ assignmentId: string }>> {
  return attempt("grantAdminRole", async () => {
    const actor = await requireAdminRole("super_admin");
    const input = parseInput(grantSchema, { targetUserId, role });

    // No self-grant, full stop — even a super_admin cannot hand themselves
    // a role (including re-granting their own super_admin) through this path.
    if (input.targetUserId === actor.id) {
      throw new PreconditionError("You cannot grant yourself an admin role.");
    }

    const sql = getSql();

    const target = (await sql`
      select id, role from "user" where id = ${input.targetUserId} limit 1
    `) as { id: string; role: string }[];
    if (target.length === 0) throw new PreconditionError("User not found.");

    const roleRow = (await sql`
      select id from admin_roles where name = ${input.role} limit 1
    `) as { id: string }[];
    if (roleRow.length === 0) throw new PreconditionError("Not a recognised admin role.");

    // Idempotent: a live (unrevoked) assignment of this role to this user
    // already exists, so there is nothing new to grant. The unique index
    // (user_id, role_id) where revoked_at is null would reject a duplicate
    // insert anyway; checking first avoids surfacing that as a raw DB error.
    const existing = (await sql`
      select id from admin_role_assignments
      where user_id = ${input.targetUserId} and role_id = ${roleRow[0].id} and revoked_at is null
      limit 1
    `) as { id: string }[];
    if (existing.length > 0) return { assignmentId: existing[0].id };

    const assignmentId = newId("ara");
    await sql`
      insert into admin_role_assignments (id, user_id, role_id, granted_by)
      values (${assignmentId}, ${input.targetUserId}, ${roleRow[0].id}, ${actor.id})
    `;

    // A team member needs the base "admin" Role to reach /physical-wall/admin
    // at all (requireRolePage's pre-existing gate checks only this column, not
    // admin_role_assignments) - granting a granular role is meaningless if the
    // recipient can't get in the door to use it.
    if (target[0].role !== "admin") {
      await sql`update "user" set role = 'admin' where id = ${input.targetUserId}`;
    }

    await recordAudit({
      actor,
      action: "admin-role.granted",
      subjectType: "user",
      subjectId: input.targetUserId,
      after: { role: input.role, assignmentId },
    });

    return { assignmentId };
  });
}

export async function revokeAdminRole(
  targetUserId: string,
  role: AdminRoleName
): Promise<Result<{ revoked: boolean }>> {
  return attempt("revokeAdminRole", async () => {
    const actor = await requireAdminRole("super_admin");
    const input = parseInput(grantSchema, { targetUserId, role });

    if (input.targetUserId === actor.id) {
      throw new PreconditionError("You cannot revoke your own admin role.");
    }

    const sql = getSql();
    const rows = (await sql`
      update admin_role_assignments a
      set revoked_by = ${actor.id}, revoked_at = now()
      from admin_roles r
      where a.role_id = r.id
        and a.user_id = ${input.targetUserId}
        and r.name = ${input.role}
        and a.revoked_at is null
      returning a.id
    `) as { id: string }[];

    if (rows.length === 0) return { revoked: false };

    await recordAudit({
      actor,
      action: "admin-role.revoked",
      subjectType: "user",
      subjectId: input.targetUserId,
      after: { role: input.role, assignmentId: rows[0].id },
    });

    return { revoked: true };
  });
}

/** Every live (unrevoked) admin role assignment, for an admin roles dashboard. */
export async function listAdminRoleAssignments() {
  return readSafely("listAdminRoleAssignments", [], async () => {
    await requireAdminRole("super_admin");
    const sql = getSql();
    return (await sql`
      select a.id, a.user_id, u.name, u.email, r.name as role, a.granted_by, a.granted_at
      from admin_role_assignments a
      join admin_roles r on r.id = a.role_id
      join "user" u on u.id = a.user_id
      where a.revoked_at is null
      order by a.granted_at desc
    `) as {
      id: string;
      user_id: string;
      name: string;
      email: string;
      role: string;
      granted_by: string | null;
      granted_at: string;
    }[];
  });
}

/**
 * FE-3.17: the grant/revoke form on the admin-roles console works by email
 * (what a super_admin actually has on hand), not raw user id — these two
 * wrapper actions resolve the email to a user id and delegate to
 * `grantAdminRole`/`revokeAdminRole` above, which keep every real guard
 * (super_admin-only, no self-grant, idempotent, audited). `useActionState`
 * form shape (ActionState in/out) to match this codebase's other admin forms
 * (e.g. `reviewIdentity`) rather than the plain `Result` the two underlying
 * actions return, since this one is called directly from a `<form action>`.
 */
const emailFormSchema = z.object({
  email: z.string({ error: "Enter the user's email." }).trim().email("Not a valid email.").max(320),
  role: roleNameSchema,
});

async function resolveUserIdByEmail(email: string): Promise<string> {
  const sql = getSql();
  const rows = (await sql`select id from "user" where email = ${email} limit 1`) as { id: string }[];
  if (rows.length === 0) throw new PreconditionError(`No user with email "${email}".`);
  return rows[0].id;
}

/**
 * Problem #2/#3: the console already fetches `listAdminRoleAssignments()`
 * fresh on every render of /physical-wall/admin/roles (it's a plain
 * `await` in a Server Component page, no client cache in front of it) and
 * already renders a "Current assignments" table from that data — so the
 * list existed; it just never refreshed after a grant/revoke because
 * `useActionState`'s re-render only updates the *form's* returned state,
 * not the server-fetched props the page passed to it. `revalidatePath` on
 * the gated route is this codebase's existing pattern for exactly this
 * "show the new state immediately, no manual reload" need (see
 * approveCurator/rejectCurator's `revalidatePath("/discover")` in
 * src/features/curators/actions.ts).
 */
const ADMIN_ROLES_PATH = "/physical-wall/admin/roles";

export async function grantAdminRoleByEmail(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { email, role } = formInput(emailFormSchema, formData);
    const targetUserId = await resolveUserIdByEmail(email);
    const result = await grantAdminRole(targetUserId, role);
    if (!result.ok) return fail(result.error);
    revalidatePath(ADMIN_ROLES_PATH);
    return ok(`Granted ${role} to ${email}.`);
  } catch (error) {
    return error instanceof PreconditionError ? fail(error.message) : fail("That didn't work. The error has been logged.");
  }
}

export async function revokeAdminRoleByEmail(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { email, role } = formInput(emailFormSchema, formData);
    const targetUserId = await resolveUserIdByEmail(email);
    const result = await revokeAdminRole(targetUserId, role);
    if (!result.ok) return fail(result.error);
    if (result.data.revoked) revalidatePath(ADMIN_ROLES_PATH);
    return result.data.revoked
      ? ok(`Revoked ${role} from ${email}.`)
      : ok(`${email} did not hold ${role}.`);
  } catch (error) {
    return error instanceof PreconditionError ? fail(error.message) : fail("That didn't work. The error has been logged.");
  }
}
