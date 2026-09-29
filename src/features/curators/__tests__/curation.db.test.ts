import { afterAll, afterEach, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeArtwork, makeProfile, makeUser, purgeTestData, q } from "@/test/fixtures";
import { applyCurator, approveCurator, suspendCurator } from "@/features/curators/actions";
import {
  addArtworkToExhibition,
  createExhibition,
  getPublicExhibition,
  publishExhibition,
} from "@/features/exhibitions/actions";
import type { Result } from "@/features/physical-wall/action-state";

afterAll(purgeTestData);
afterEach(() => {
  delete process.env.CURATOR_COMMISSION_BPS;
});

/** The data of an ok result; fails the test with the message otherwise. */
function data<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.data;
}
const errorOf = (r: Result<unknown>) => (r.ok ? null : r.error);

const complete = { startDate: "2031-03-01", endDate: "2031-03-31" };

describe("exhibitions (BE-1.23)", () => {
  it("owner publishes a draft; it becomes public; others can't; only own works can be added", async () => {
    const owner = await makeUser();
    await makeProfile(owner.id);
    const mine = await makeArtwork(owner.id);
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
    data(await addArtworkToExhibition(id, await makeArtwork(owner.id)));
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
  it("admin approves (commission fixed from env) and suspends, each audited; non-admins refused", async () => {
    const applicant = await makeUser();
    actAs(applicant);
    const id = data(await applyCurator({ displayName: "betest curator" }));
    expect(errorOf(await approveCurator(id))).toMatch(/admin access/);

    const admin = await makeUser("admin");
    actAs(admin);
    process.env.CURATOR_COMMISSION_BPS = "1250";
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
  });

  it("approving an already-active curator is a no-op: same state, no second audit row, even concurrently", async () => {
    actAs(await makeUser());
    const id = data(await applyCurator({ displayName: "betest curator 2" }));
    actAs(await makeUser("admin"));

    // Five approvals at once (double clicks, two admins): one transition.
    const results = (await Promise.all([1, 2, 3, 4, 5].map(() => approveCurator(id)))).map(data);
    expect(results.every((r) => r.status === "active")).toBe(true);
    expect(results.filter((r) => !r.unchanged)).toHaveLength(1);

    const again = data(await approveCurator(id));
    expect(again).toMatchObject({ id, status: "active", unchanged: true });
    expect(await q(`select 1 from pw_audit_log where subject_id = $1 and action = 'curator.approved'`, [id])).toHaveLength(1);
  });
});
