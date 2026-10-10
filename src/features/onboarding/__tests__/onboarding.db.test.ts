import { afterAll, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeProfile, makeUser, purgeTestData, q } from "@/test/fixtures";
import { getOnboardingPersona, setOnboardingPersona } from "@/features/onboarding/actions";
import type { Result } from "@/features/physical-wall/action-state";

afterAll(purgeTestData);

function data<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.data;
}

describe("onboarding persona (one-time 'What brings you to ArtWall?')", () => {
  it("a brand new user has never been asked, until they choose", async () => {
    const newUser = await makeUser();
    actAs(newUser);

    expect(await getOnboardingPersona()).toBeNull();

    expect(data(await setOnboardingPersona({ persona: "curator" }))).toBe("curator");
    expect(await getOnboardingPersona()).toBe("curator");
  });

  it("choosing again overwrites rather than erroring (idempotent, not one-shot-locked)", async () => {
    const newUser = await makeUser();
    actAs(newUser);

    data(await setOnboardingPersona({ persona: "buyer" }));
    expect(data(await setOnboardingPersona({ persona: "artist" }))).toBe("artist");
    expect(await getOnboardingPersona()).toBe("artist");
  });

  it("rejects a persona outside the three allowed values", async () => {
    const newUser = await makeUser();
    actAs(newUser);

    const result = await setOnboardingPersona({ persona: "buyer-but-also-evil" as never });
    expect(result.ok).toBe(false);
  });

  it("a user who already has an artist_profiles row from before this feature existed is left null by the action layer (only the migration's one-time backfill sets it)", async () => {
    const preExisting = await makeUser();
    await makeProfile(preExisting.id);
    actAs(preExisting);

    // The action never infers persona from artist_profiles presence (per the
    // ground rule: profile-row existence predates this question and is not a
    // reliable "was asked" signal) - this row was only ever backfilled once,
    // directly in the migration, for users who already existed at cutover.
    expect(await getOnboardingPersona()).toBeNull();
  });

  it("is scoped per user, not global", async () => {
    const a = await makeUser();
    const b = await makeUser();

    actAs(a);
    data(await setOnboardingPersona({ persona: "artist" }));

    actAs(b);
    expect(await getOnboardingPersona()).toBeNull();

    const rows = await q<{ id: string; onboarding_persona: string | null }>(
      `select id, onboarding_persona from "user" where id = any($1)`,
      [[a.id, b.id]]
    );
    expect(rows.find((r) => r.id === a.id)?.onboarding_persona).toBe("artist");
    expect(rows.find((r) => r.id === b.id)?.onboarding_persona).toBeNull();
  });
});
