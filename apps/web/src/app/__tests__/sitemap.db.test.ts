import { afterAll, expect, test } from "vitest";

import sitemap, { generateSitemaps } from "@/app/sitemap";
import { makeArtwork, makeProfile, makeUser, purgeTestData } from "@/test/fixtures";

afterAll(purgeTestData);

/**
 * FE-2.14: the generated sitemap is non-empty and lists seeded published
 * artwork URLs, and only those (a private work or an unpublished artist
 * 404s at /artwork/[id] and must not be listed here either).
 *
 * The artwork chunk lives at sitemap({ id }) for id > 0 (PERF-2.08
 * chunking) — sitemap() with no id returns only static routes + artists,
 * so this test must go through generateSitemaps()/chunk 1 to reach
 * artworks at all.
 */
test("sitemap lists seeded published artworks and skips unpublished ones", async () => {
  const pub = await makeUser();
  await makeProfile(pub.id, { published: true });
  const hidden = await makeUser();
  await makeProfile(hidden.id, { published: false });

  const shown = await makeArtwork(pub.id);
  const privateWork = await makeArtwork(pub.id, { isPublic: false });
  const unpublishedArtist = await makeArtwork(hidden.id);

  const staticEntries = await sitemap();
  expect(staticEntries.length).toBeGreaterThan(0);

  const chunks = await generateSitemaps();
  expect(chunks.length).toBeGreaterThan(1); // id 0 (static+artists) + at least one artwork chunk

  const artworkUrls = (
    await Promise.all(
      chunks.slice(1).map((c) => sitemap({ id: Promise.resolve(String(c.id)) }))
    )
  )
    .flat()
    .map((e) => e.url);

  expect(artworkUrls.length).toBeGreaterThan(0);
  expect(artworkUrls.some((u) => u.endsWith(`/artwork/${shown}`))).toBe(true);
  expect(artworkUrls.some((u) => u.endsWith(`/artwork/${privateWork}`))).toBe(false);
  expect(artworkUrls.some((u) => u.endsWith(`/artwork/${unpublishedArtist}`))).toBe(false);
});
