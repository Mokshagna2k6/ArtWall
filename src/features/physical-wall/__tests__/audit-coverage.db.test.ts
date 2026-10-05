import { afterAll, describe, expect, it, vi } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import { reviewIdentity } from "@/features/physical-wall/actions/identity";
import { approveCurator } from "@/features/curators/actions";
import { getActor } from "@/features/physical-wall/authorize";

/**
 * SEC-2.11: admin and security-relevant actions write to the append-only
 * audit log with actor, target, timestamp, and (SEC-2.11 — new) IP.
 *
 * Role grant and refund are covered by their own existing tests/call sites:
 *   - role grant: the only "grant a role" path in the codebase today is the
 *     ADMIN_EMAILS self-bootstrap in authorize.ts (no admin-facing "promote
 *     this user" UI exists yet) — asserted below as `user.role-granted`.
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

  it("the ADMIN_EMAILS allowlist bootstrap audits the role grant it performs", async () => {
    const founder = await makeUser();
    await q(`update "user" set email = $2 where id = $1`, [founder.id, `${tid("founder")}@artwall.test`]);
    const [{ email }] = await q<{ email: string }>(`select email from "user" where id = $1`, [founder.id]);

    const previous = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = email;
    try {
      actAs({ ...founder, email });
      const actor = await getActor();
      expect(actor?.role).toBe("admin");
    } finally {
      process.env.ADMIN_EMAILS = previous;
    }

    const [row] = await q<{ subject_id: string; actor_id: string | null; actor_ip: string | null }>(
      `select subject_id, actor_id, actor_ip from pw_audit_log
       where action = 'user.role-granted' and subject_id = $1`,
      [founder.id]
    );
    expect(row).toBeTruthy();
    // No human granter to attribute — the allowlist itself is the authority.
    expect(row.actor_id).toBeNull();
    expect(row.actor_ip).toBeTruthy();
  });
});
