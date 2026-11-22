import { afterAll, describe, expect, it } from "vitest";

import { actAs, type TestUser } from "@/test/db-setup";
import { grantTestAdminRole, makeUser, purgeTestData, q } from "@/test/fixtures";
import {
  grantAdminRole,
  revokeAdminRole,
  listAdminRoleAssignments,
} from "@/features/physical-wall/actions/admin-roles";
import { getActor, hasAdminRole, listOwnAdminRoles } from "@/features/physical-wall/authorize";

/**
 * SEC-3.03: role grants require an existing super-admin, are audit-logged,
 * and cannot be self-granted.
 */
afterAll(purgeTestData);

describe("grantAdminRole / revokeAdminRole (SEC-3.03)", () => {
  it("a non-super-admin (plain admin) is rejected", async () => {
    const actor = await makeUser("admin"); // generic admin, no super_admin role
    const target = await makeUser("admin");
    actAs(actor);

    const result = await grantAdminRole(target.id, "venue_admin");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/super_admin admin role/);

    expect(await hasAdminRole(await getActor(), "venue_admin")).toBe(false);
  });

  it("a non-admin (generic role) is rejected before the super_admin check even applies", async () => {
    const actor = await makeUser("artist");
    const target = await makeUser("admin");
    actAs(actor);

    const result = await grantAdminRole(target.id, "venue_admin");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/admin access/);
  });

  it("a super-admin attempting to self-grant is rejected", async () => {
    const superAdmin = await makeUser("admin");
    await grantTestAdminRole(superAdmin.id, "super_admin");
    actAs(superAdmin);

    const result = await grantAdminRole(superAdmin.id, "finance_admin");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cannot grant yourself/);
  });

  it("a super-admin attempting to self-revoke is rejected", async () => {
    const superAdmin = await makeUser("admin");
    await grantTestAdminRole(superAdmin.id, "super_admin");
    actAs(superAdmin);

    const result = await revokeAdminRole(superAdmin.id, "super_admin");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cannot revoke your own/);
  });

  it("a legitimate grant by a super-admin succeeds, is audit-logged, and takes effect immediately", async () => {
    const superAdmin = await makeUser("admin");
    await grantTestAdminRole(superAdmin.id, "super_admin");
    const target = await makeUser("admin");
    actAs(superAdmin);

    const result = await grantAdminRole(target.id, "finance_admin");
    expect(result.ok).toBe(true);

    const targetActor = { ...target, role: "admin" as const };
    expect(await hasAdminRole(targetActor, "finance_admin")).toBe(true);

    const [audit] = await q<{ action: string; actor_id: string; subject_id: string; after: { role: string } }>(
      `select action, actor_id, subject_id, after from pw_audit_log
       where action = 'admin-role.granted' and subject_id = $1
       order by at desc limit 1`,
      [target.id]
    );
    expect(audit).toBeTruthy();
    expect(audit.actor_id).toBe(superAdmin.id);
    expect(audit.after.role).toBe("finance_admin");
  });

  it("granting the same role twice is idempotent: no duplicate live assignment, no second audit row", async () => {
    const superAdmin = await makeUser("admin");
    await grantTestAdminRole(superAdmin.id, "super_admin");
    const target = await makeUser("admin");
    actAs(superAdmin);

    const first = await grantAdminRole(target.id, "content_admin");
    const second = await grantAdminRole(target.id, "content_admin");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const rows = await q(
      `select 1 from admin_role_assignments a join admin_roles r on r.id = a.role_id
       where a.user_id = $1 and r.name = 'content_admin' and a.revoked_at is null`,
      [target.id]
    );
    expect(rows).toHaveLength(1);

    const auditRows = await q(
      `select 1 from pw_audit_log where action = 'admin-role.granted' and subject_id = $1`,
      [target.id]
    );
    expect(auditRows).toHaveLength(1);
  });

  it("a legitimate revoke by a super-admin succeeds, is audit-logged, and takes effect immediately", async () => {
    const superAdmin = await makeUser("admin");
    await grantTestAdminRole(superAdmin.id, "super_admin");
    const target = await makeUser("admin");
    await grantTestAdminRole(target.id, "support_admin");
    actAs(superAdmin);

    const result = await revokeAdminRole(target.id, "support_admin");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.revoked).toBe(true);

    const targetActor = { ...target, role: "admin" as const };
    expect(await hasAdminRole(targetActor, "support_admin")).toBe(false);

    const [audit] = await q<{ actor_id: string; subject_id: string }>(
      `select actor_id, subject_id from pw_audit_log
       where action = 'admin-role.revoked' and subject_id = $1
       order by at desc limit 1`,
      [target.id]
    );
    expect(audit).toBeTruthy();
    expect(audit.actor_id).toBe(superAdmin.id);
  });

  it("revoking a role the user does not hold is a no-op, not an error", async () => {
    const superAdmin = await makeUser("admin");
    await grantTestAdminRole(superAdmin.id, "super_admin");
    const target = await makeUser("admin");
    actAs(superAdmin);

    const result = await revokeAdminRole(target.id, "analytics_admin");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.revoked).toBe(false);
  });

  it("listAdminRoleAssignments is itself super_admin-gated and lists live grants", async () => {
    const plainAdmin = await makeUser("admin");
    actAs(plainAdmin);
    expect(await listAdminRoleAssignments()).toEqual([]);

    const superAdmin = await makeUser("admin");
    await grantTestAdminRole(superAdmin.id, "super_admin");
    const target = await makeUser("admin");
    await grantTestAdminRole(target.id, "venue_admin");
    actAs(superAdmin);

    const rows = await listAdminRoleAssignments();
    expect(rows.some((r) => r.user_id === target.id && r.role === "venue_admin")).toBe(true);
  });
});

/**
 * FE-3.17: `listOwnAdminRoles` is what the admin layout's nav filter and
 * `requireAnyAdminRolePage` both key off. Real fixture users holding
 * different single roles, confirming each sees exactly their own role(s)
 * back and nothing else — the same per-role isolation the admin console's
 * nav/page gating depends on.
 *
 * `listOwnAdminRoles` takes an `Actor` (has `.role`), not the bare
 * `TestUser` `makeUser` returns — same as every other authorize.ts function
 * in this file (`hasAdminRole`), so `asActor` resolves one via `getActor()`
 * after `actAs()`, exactly how a real request would.
 */
async function asActor(user: TestUser) {
  actAs(user);
  const actor = await getActor();
  if (!actor) throw new Error("getActor() returned null for a just-created fixture user");
  return actor;
}

describe("listOwnAdminRoles (FE-3.17)", () => {
  it("a role-less admin holds no named roles", async () => {
    const admin = await asActor(await makeUser("admin"));
    expect(await listOwnAdminRoles(admin)).toEqual([]);
  });

  it("a single-role admin holds exactly that role, not others", async () => {
    const venueAdminUser = await makeUser("admin");
    await grantTestAdminRole(venueAdminUser.id, "venue_admin");
    expect(await listOwnAdminRoles(await asActor(venueAdminUser))).toEqual(["venue_admin"]);

    const complianceAdminUser = await makeUser("admin");
    await grantTestAdminRole(complianceAdminUser.id, "compliance_admin");
    expect(await listOwnAdminRoles(await asActor(complianceAdminUser))).toEqual(["compliance_admin"]);
  });

  it("a multi-role admin holds every role granted, in one read", async () => {
    const multiUser = await makeUser("admin");
    await grantTestAdminRole(multiUser.id, "curator_admin");
    await grantTestAdminRole(multiUser.id, "finance_admin");
    const held = await listOwnAdminRoles(await asActor(multiUser));
    expect(held).toEqual(expect.arrayContaining(["curator_admin", "finance_admin"]));
    expect(held).toHaveLength(2);
  });

  it("super_admin is reported like any other held role (the layout's own code decides it means 'see everything')", async () => {
    const superAdminUser = await makeUser("admin");
    await grantTestAdminRole(superAdminUser.id, "super_admin");
    expect(await listOwnAdminRoles(await asActor(superAdminUser))).toEqual(["super_admin"]);
  });

  it("a revoked role no longer shows up", async () => {
    const adminUser = await makeUser("admin");
    await grantTestAdminRole(adminUser.id, "curator_admin");
    const actor = await asActor(adminUser);
    expect(await listOwnAdminRoles(actor)).toEqual(["curator_admin"]);

    await q(
      `update admin_role_assignments set revoked_at = now()
       where user_id = $1 and revoked_at is null`,
      [adminUser.id]
    );
    expect(await listOwnAdminRoles(actor)).toEqual([]);
  });

  it("null actor (signed out) holds no roles", async () => {
    expect(await listOwnAdminRoles(null)).toEqual([]);
  });
});
