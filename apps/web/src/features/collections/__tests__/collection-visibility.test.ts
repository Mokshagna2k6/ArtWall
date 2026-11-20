import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A public collection must not expose work the rest of the site hides.
 *
 * Found by a QA agent on the live site: it unpublished an artist profile, and
 * /artwork/:id and /artist/:handle both correctly went 404 — but the public
 * collection page still listed the work's title, price and artist name, with
 * a link to the 404. `getCollectionArtworkRows` had no visibility filter.
 *
 * Static assertions rather than a DB test: this file has no DB test harness,
 * and the regression is a missing WHERE clause, which is visible in source.
 */
describe("public collection visibility", () => {
  const src = readFileSync(resolve(__dirname, "../actions.ts"), "utf8");

  it("filters collection artworks by the same rule the artwork page uses", () => {
    // artworkDetail (features/marketplace/actions.ts) gates on both of these.
    expect(src).toMatch(/eq\(artworks\.isPublic, true\)/);
    expect(src).toMatch(/eq\(artistProfiles\.published, true\)/);
  });

  it("applies that filter to the public read, not the owner's own studio view", () => {
    // The owner must still see their own drafts; only the public path filters.
    expect(src).toMatch(/getCollectionArtworkRows\(row\.id, true\)/);
    expect(src).toMatch(/getCollectionArtworkRows\(row\.id, false\)/);
    // The unparameterised call is what shipped the leak.
    expect(src).not.toMatch(/getCollectionArtworkRows\(row\.id\)/);
  });
});
