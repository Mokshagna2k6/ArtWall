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

afterAll(purgeTestData);
afterEach(() => {
  delete process.env.CURATOR_COMMISSION_BPS;
});

describe("exhibitions (BE-1.23)", () => {
  it("owner publishes a draft; it becomes public; others can't; only own works can be added", async () => {
    const owner = await makeUser();
    await makeProfile(owner.id);
    const mine = await makeArtwork(owner.id);
    const theirs = await makeArtwork((await makeUser()).id);

    actAs(owner);
    const id = await createExhibition({ title: "betest show" });
    await addArtworkToExhibition(id, mine);
    await expect(addArtworkToExhibition(id, theirs)).rejects.toThrow();
    expect(await getPublicExhibition(id)).toBeNull();

    actAs(await makeUser());
    await expect(publishExhibition(id)).rejects.toThrow();

    actAs(owner);
    expect(await publishExhibition(id)).toEqual({ id, status: "published" });
    const pub = await getPublicExhibition(id);
    expect(pub?.artworks.map((a) => a.id)).toEqual([mine]);
    await expect(publishExhibition(id)).rejects.toThrow(); // not a draft any more
  });

  it("an admin can publish someone else's draft, and it is audited", async () => {
    const owner = await makeUser();
    actAs(owner);
    const id = await createExhibition({ title: "betest show 2" });
    const admin = await makeUser("admin");
    actAs(admin);
    await publishExhibition(id);
    expect(await q(`select 1 from pw_audit_log where subject_id = $1 and actor_id = $2`, [id, admin.id])).toHaveLength(1);
  });
});

describe("curators (BE-1.24 – 1.26)", () => {
  it("admin approves (commission fixed from env) and suspends, each audited; non-admins refused", async () => {
    const applicant = await makeUser();
    actAs(applicant);
    const id = await applyCurator({ displayName: "betest curator" });
    await expect(approveCurator(id)).rejects.toThrow();

    const admin = await makeUser("admin");
    actAs(admin);
    process.env.CURATOR_COMMISSION_BPS = "1250";
    expect(await approveCurator(id)).toEqual({ id, status: "active", commissionBps: 1250 });
    await expect(approveCurator(id)).rejects.toThrow(/not pending/);

    await expect(suspendCurator(id, " ")).rejects.toThrow(/reason/);
    expect((await suspendCurator(id, "betest policy breach")).status).toBe("suspended");

    const audit = await q<{ action: string; actor_id: string }>(
      `select action, actor_id from pw_audit_log where subject_id = $1 order by at, id`,
      [id]
    );
    expect(audit).toEqual([
      { action: "curator.approved", actor_id: admin.id },
      { action: "curator.suspended", actor_id: admin.id },
    ]);
  });
});
