import { afterAll, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { grantTestAdminRole, makeArtwork, makeProfile, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import { applyCurator, approveCurator, getMyCuratorApplication, rejectCurator, suspendCurator } from "@/features/curators/actions";
import {
  addArtworkToExhibition,
  createExhibition,
  getPublicExhibition,
  publishExhibition,
} from "@/features/exhibitions/actions";
import type { Result } from "@/features/physical-wall/action-state";

afterAll(purgeTestData);

/** The data of an ok result; fails the test with the message otherwise. */
function data<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.data;
}
const errorOf = (r: Result<unknown>) => (r.ok ? null : r.error);

const complete = { startDate: "2031-03-01", endDate: "2031-03-31" };

/**
 * BE-3.03/BE-3.04: publishExhibition now runs every member artwork through
 * canExhibit (physical binding verified AND blockchain anchored). These
 * exhibition CRUD/permission tests predate that gate and otherwise test
 * ownership/validation, not trust dimensions — so give the fixture artwork
 * a bound tag and a minted commitment to clear the gate, same as
 * trust.db.test.ts's own real-row setup.
 */
async function makeExhibitableArtwork(userId: string) {
  const art = await makeArtwork(userId);
  const tag = tid("tag");
  await q(`insert into art_tags (id, tag_uid) values ($1, $1)`, [tag]);
  await q(`update art_tags set artwork_id = $2, bound_at = now(), bound_by = $3 where id = $1`, [tag, art, userId]);
  const mint = tid("mint");
  await q(`insert into mint_commitments (id, artwork_id, user_id, leaf_hash, status) values ($1, $2, $3, $1, 'pending')`, [
    mint,
    art,
    userId,
  ]);
  await q(`update mint_commitments set status = 'minted', token_id = '1', mint_tx_hash = '0xabc' where id = $1`, [mint]);
  return art;
}

describe("exhibitions (BE-1.23)", () => {
  it("owner publishes a draft; it becomes public; others can't; only own works can be added", async () => {
    const owner = await makeUser();
    await makeProfile(owner.id);
    const mine = await makeExhibitableArtwork(owner.id);
    const theirs = await makeArtwork((await makeUser()).id);

    actAs(owner);
    const id = data(await createExhibition({ title: "betest show", ...complete }));
    data(await addArtworkToExhibition(id, mine));
    expect(errorOf(await addArtworkToExhibition(id, theirs))).toMatch(/not found/);
    expect(await getPublicExhibition(id)).toBeNull();

    actAs(await makeUser());
    expect(errorOf(await publishExhibition(id))).toMatch(/not yours/);

    actAs(owner);
    expect(data(await publishExhibition(id))).toEqual({ id, status: "published" });
    const pub = await getPublicExhibition(id);
    expect(pub?.artworks.map((a) => a.id)).toEqual([mine]);
    expect(errorOf(await publishExhibition(id))).toMatch(/not a draft/);
  });

  it("an admin can publish someone else's draft, and it is audited", async () => {
    const owner = await makeUser();
    actAs(owner);
    const id = data(await createExhibition({ title: "betest show 2", ...complete }));
    data(await addArtworkToExhibition(id, await makeExhibitableArtwork(owner.id)));
    const admin = await makeUser("admin");
    actAs(admin);
    data(await publishExhibition(id));
    expect(await q(`select 1 from pw_audit_log where subject_id = $1 and actor_id = $2`, [id, admin.id])).toHaveLength(1);
  });
});

describe("exhibition publish validation (BE-2.18)", () => {
  it("refuses to publish without an artwork, without dates, or with dates out of order", async () => {
    const owner = await makeUser();
    actAs(owner);
    const art = await makeArtwork(owner.id);

    const noWorks = data(await createExhibition({ title: "betest empty", ...complete }));
    expect(errorOf(await publishExhibition(noWorks))).toMatch(/at least one artwork/);

    const noDates = data(await createExhibition({ title: "betest undated" }));
    data(await addArtworkToExhibition(noDates, art));
    expect(errorOf(await publishExhibition(noDates))).toMatch(/start and end dates/);

    expect(errorOf(await createExhibition({ title: "betest backwards", startDate: "2031-03-31", endDate: "2031-03-01" }))).toMatch(
      /end date is before/
    );
    expect(errorOf(await createExhibition({ title: "   " }))).toMatch(/title/);

    // A blank title can only come from outside the action; the publish check still holds.
    const blank = data(await createExhibition({ title: "betest blank", ...complete }));
    data(await addArtworkToExhibition(blank, art));
    await q(`update exhibitions set title = '' where id = $1`, [blank]);
    expect(errorOf(await publishExhibition(blank))).toMatch(/a title/);

    const rows = await q<{ status: string }>(`select status from exhibitions where id = any($1)`, [[noWorks, noDates, blank]]);
    expect(rows.every((r) => r.status === "draft")).toBe(true);
  });
});

describe("curators (BE-1.24 – 1.26, BE-2.19)", () => {
  it("admin approves (commission fixed from the active commission_policies row) and suspends, each audited; non-admins refused", async () => {
    const applicant = await makeUser();
    actAs(applicant);
    const id = data(await applyCurator({ displayName: "betest curator" }));
    expect(errorOf(await approveCurator(id))).toMatch(/admin access/);

    const admin = await makeUser("admin");
    await grantTestAdminRole(admin.id, "curator_admin");
    actAs(admin);
    // BE-3.09/3.10: the rate comes from the active commission_policies row,
    // not an env var. Swap "active" to a fresh betest rate for this run, and
    // put the real one back afterward — commission_policies is append-only
    // in spirit (BE-3.09) but has no DB trigger stopping `active` flips, so
    // the test must restore it itself.
    const policyId = tid("cpol");
    await q(`update commission_policies set active = false where kind = 'curator_commission' and active`);
    await q(
      `insert into commission_policies (id, kind, rate_bps, active, note) values ($1, 'curator_commission', 1250, true, 'betest override')`,
      [policyId]
    );
    try {
      expect(data(await approveCurator(id))).toEqual({ id, status: "active", commissionBps: 1250, unchanged: false });

      expect(errorOf(await suspendCurator(id, " "))).toMatch(/reason/);
      expect(data(await suspendCurator(id, "betest policy breach")).status).toBe("suspended");
      expect(errorOf(await approveCurator(id))).toMatch(/suspended, not pending/);

      const audit = await q<{ action: string; actor_id: string }>(
        `select action, actor_id from pw_audit_log where subject_id = $1 order by at, id`,
        [id]
      );
      expect(audit).toEqual([
        { action: "curator.approved", actor_id: admin.id },
        { action: "curator.suspended", actor_id: admin.id },
      ]);
    } finally {
      await q(`delete from commission_policies where id = $1`, [policyId]);
      await q(`update commission_policies set active = true where kind = 'curator_commission' and id = 'cpol_curator_v1'`);
    }
  });

  it("approving an already-active curator is a no-op: same state, no second audit row, even concurrently", async () => {
    actAs(await makeUser());
    const id = data(await applyCurator({ displayName: "betest curator 2" }));
    const approver = await makeUser("admin");
    await grantTestAdminRole(approver.id, "curator_admin");
    actAs(approver);

    // Five approvals at once (double clicks, two admins): one transition.
    const results = (await Promise.all([1, 2, 3, 4, 5].map(() => approveCurator(id)))).map(data);
    expect(results.every((r) => r.status === "active")).toBe(true);
    expect(results.filter((r) => !r.unchanged)).toHaveLength(1);

    const again = data(await approveCurator(id));
    expect(again).toMatchObject({ id, status: "active", unchanged: true });
    expect(await q(`select 1 from pw_audit_log where subject_id = $1 and action = 'curator.approved'`, [id])).toHaveLength(1);
  });

  it("a user cannot apply twice, and cannot approve their own application", async () => {
    const applicant = await makeUser();
    actAs(applicant);
    const id = data(await applyCurator({ displayName: "betest curator 3" }));

    // Duplicate application refused — one row per user, whatever its status.
    expect(errorOf(await applyCurator({ displayName: "betest curator 3 again" }))).toMatch(/already/i);

    // Self-approval: the applicant has no admin role at all, so this fails
    // the same way the existing "non-admins refused" case does. The only
    // path to 'active' is moveCurator, which is reachable solely through
    // approveCurator/rejectCurator — both gated by requireAdminRole
    // ("curator_admin") before any row is touched, so a plain user has no
    // route to flip their own status regardless of which action they call.
    expect(errorOf(await approveCurator(id))).toMatch(/admin access/);
    expect(errorOf(await rejectCurator(id))).toMatch(/admin access/);

    const mine = await getMyCuratorApplication();
    expect(mine).toMatchObject({ id, status: "pending" });
  });

  it("admin rejects a pending application; rejecting is a no-op the second time; approving a rejected application fails", async () => {
    const applicant = await makeUser();
    actAs(applicant);
    const id = data(await applyCurator({ displayName: "betest curator 4" }));

    const admin = await makeUser("admin");
    await grantTestAdminRole(admin.id, "curator_admin");
    actAs(admin);

    expect(data(await rejectCurator(id))).toMatchObject({ id, status: "rejected", unchanged: false });
    expect(data(await rejectCurator(id))).toMatchObject({ id, status: "rejected", unchanged: true });
    expect(errorOf(await approveCurator(id))).toMatch(/rejected, not pending/);

    const audit = await q<{ action: string; actor_id: string }>(
      `select action, actor_id from pw_audit_log where subject_id = $1 and action = 'curator.rejected'`,
      [id]
    );
    expect(audit).toEqual([{ action: "curator.rejected", actor_id: admin.id }]);

    actAs(applicant);
    const mine = await getMyCuratorApplication();
    expect(mine).toMatchObject({ id, status: "rejected" });
  });
});
