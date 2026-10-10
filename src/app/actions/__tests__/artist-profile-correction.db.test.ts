import { afterAll, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeUser, purgeTestData, q } from "@/test/fixtures";
import { saveArtistProfile } from "@/app/actions/artist-profile";

afterAll(purgeTestData);

/**
 * BE-3.19: a self-service data correction logs the correction (DPDP §120-127).
 * Propagation: everything else that shows this profile (marketplace listings,
 * /artists, /artist/[handle]) reads it live via a join — nothing denormalizes
 * it — so there is nothing further to propagate to. See the comment in
 * src/app/actions/artist-profile.ts for the one deliberate exception
 * (coa_certificates.creatorName, frozen at issuance).
 */
describe("saveArtistProfile correction audit (BE-3.19)", () => {
  it("logs a profile.corrected audit entry with before/after on every save", async () => {
    const artist = await makeUser();
    actAs(artist);

    const first = {
      displayName: "Original Name",
      handle: `handle-${artist.id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}`,
      discipline: "Painter",
      location: "Mumbai",
      bio: "A painter working across mixed media for more than a decade now.",
      instagram: "",
    };
    await saveArtistProfile(first);

    const corrected = { ...first, displayName: "Corrected Name" };
    await saveArtistProfile(corrected);

    const rows = await q<{ action: string; subject_id: string; before: unknown; after: unknown }>(
      `select action, subject_id, before, after from pw_audit_log
       where action = 'profile.corrected' and subject_id = $1
       order by at desc limit 1`,
      [artist.id]
    );
    expect(rows).toHaveLength(1);
    expect((rows[0].before as { displayName: string }).displayName).toBe("Original Name");
    expect((rows[0].after as { displayName: string }).displayName).toBe("Corrected Name");

    const [profile] = await q<{ displayName: string }>(
      `select "displayName" from artist_profiles where "userId" = $1`,
      [artist.id]
    );
    expect(profile.displayName).toBe("Corrected Name");
  });
});
