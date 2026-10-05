import { afterAll, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { grantTestAdminRole, makeUser, purgeTestData, q } from "@/test/fixtures";
import {
  grantAdminRole,
  revokeAdminRole,
  listAdminRoleAssignments,
} from "@/features/physical-wall/actions/admin-roles";
import { getActor, hasAdminRole } from "@/features/physical-wall/authorize";

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

    const result = await revokeAdminRole(target.id, "readonly_admin");
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
