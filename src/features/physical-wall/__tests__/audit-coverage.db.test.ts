import { afterAll, describe, expect, it, vi } from "vitest";

import { actAs } from "@/test/db-setup";
import { grantTestAdminRole, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import { reviewIdentity } from "@/features/physical-wall/actions/identity";
import { approveCurator } from "@/features/curators/actions";
import { grantAdminRole } from "@/features/physical-wall/actions/admin-roles";

/**
 * SEC-2.11: admin and security-relevant actions write to the append-only
 * audit log with actor, target, timestamp, and (SEC-2.11 — new) IP.
 *
 * Role grant and refund are covered by their own existing tests/call sites:
 *   - role grant: SEC-3.03's grantAdminRole/revokeAdminRole are the real
 *     "grant a role" path now (the old ADMIN_EMAILS self-bootstrap in
 *     authorize.ts was removed — see SEC-3.02) — asserted below as
 *     `admin-role.granted`. Full grant/revoke behaviour (super_admin-only,
 *     no self-grant, idempotent) is covered by
 *     src/features/physical-wall/__tests__/admin-roles.db.test.ts.
 *   - refund: src/features/physical-wall/actions/booking.ts and
 *     admin-slots.ts already record a `booking.cancelled` / force-action
 *     audit entry at queue time; refunds.ts additionally records
 *     `refund.processed`/`refund.failed` once Razorpay confirms the money
 *     actually moved — asserted in payments.db.test.ts, which already has
 *     the Razorpay mock harness this needs.
 *   - mint voucher issue: asserted in
 *     src/app/api/blockchain/__tests__/nft-routes.db.test.ts.
 *
 * notifications.ts is mocked out: this suite only cares that the audit
 * row lands, not that an email was attempted.
 */
vi.mock("@/features/physical-wall/notifications", () => ({
  notify: vi.fn(async () => {}),
}));

afterAll(purgeTestData);

async function latestAudit(action: string, subjectId: string) {
  const [row] = await q<{ actor_id: string | null; actor_ip: string | null; at: Date }>(
    `select actor_id, actor_ip, at from pw_audit_log
     where action = $1 and subject_id = $2
     order by at desc limit 1`,
    [action, subjectId]
  );
  return row;
}

describe("Audit log coverage (SEC-2.11)", () => {
  it("identity.approved / identity.rejected are audited with actor and IP", async () => {
    const applicant = await makeUser();
    const admin = await makeUser("admin");
    await grantTestAdminRole(admin.id, "compliance_admin");

    const verificationId = tid("idv");
    await q(
      `insert into pw_identity_verifications (id, user_id, doc_cloudinary_id, doc_kind) values ($1, $2, $3, 'pan')`,
      [verificationId, applicant.id, `artwall/betest/${verificationId}`]
    );

    actAs(admin);
    const form = new FormData();
    form.set("verificationId", verificationId);
    form.set("verdict", "approved");
    const result = await reviewIdentity({ status: "idle" } as never, form);
    expect(result.status).toBe("ok");

    const row = await latestAudit("identity.approved", verificationId);
    expect(row).toBeTruthy();
    expect(row.actor_id).toBe(admin.id);
    expect(row.actor_ip).toBeTruthy();
    expect(row.at).toBeInstanceOf(Date);
  });

  it("curator.approved is audited with actor and IP", async () => {
    const curatorUser = await makeUser();
    const admin = await makeUser("admin");
    await grantTestAdminRole(admin.id, "curator_admin");

    const curatorId = tid("cur");
    await q(
      `insert into curators (id, user_id, display_name, status) values ($1, $2, 'Test Curator', 'pending')`,
      [curatorId, curatorUser.id]
    );

    actAs(admin);
    const result = await approveCurator(curatorId);
    expect(result.ok).toBe(true);

    const row = await latestAudit("curator.approved", curatorId);
    expect(row).toBeTruthy();
    expect(row.actor_id).toBe(admin.id);
    expect(row.actor_ip).toBeTruthy();
  });

  it("admin-role.granted is audited with actor and IP (SEC-3.03)", async () => {
    const superAdmin = await makeUser("admin");
    await grantTestAdminRole(superAdmin.id, "super_admin");
    const target = await makeUser("admin");

    actAs(superAdmin);
    const result = await grantAdminRole(target.id, "venue_admin");
    expect(result.ok).toBe(true);

    const row = await latestAudit("admin-role.granted", target.id);
    expect(row).toBeTruthy();
    expect(row.actor_id).toBe(superAdmin.id);
    expect(row.actor_ip).toBeTruthy();
  });
});
