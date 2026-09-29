import { afterAll, expect, test } from "vitest";

import sitemap from "@/app/sitemap";
import { makeArtwork, makeProfile, makeUser, purgeTestData } from "@/test/fixtures";

afterAll(purgeTestData);

// FE-2.14: the generated sitemap is non-empty and lists published artwork
// URLs, and only those (a private work or an unpublished artist 404s).
test("sitemap lists seeded published artworks and skips unpublished ones", async () => {
  const pub = await makeUser();
  await makeProfile(pub.id, { published: true });
  const hidden = await makeUser();
  await makeProfile(hidden.id, { published: false });

  const shown = await makeArtwork(pub.id);
  const privateWork = await makeArtwork(pub.id, { isPublic: false });
  const unpublishedArtist = await makeArtwork(hidden.id);

  const urls = (await sitemap()).map((e) => e.url);
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.some((u) => u.endsWith(`/artwork/${shown}`))).toBe(true);
  expect(urls.some((u) => u.endsWith(`/artwork/${privateWork}`))).toBe(false);
  expect(urls.some((u) => u.endsWith(`/artwork/${unpublishedArtist}`))).toBe(false);
});
