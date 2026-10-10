import { afterAll, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import { createArtwork, setArtworkPublic } from "@/app/actions/artworks";

afterAll(purgeTestData);

/**
 * BE-3.03: createArtwork and setArtworkPublic both call canPublishArtwork
 * before a row ever goes public — no caller may set isPublic = true on an
 * incomplete work (no title, no image), whether at creation or afterwards.
 */
describe("artwork publish gate (BE-3.01/3.03)", () => {
  it("createArtwork succeeds public when it has a title and an image", async () => {
    const artist = await makeUser();
    actAs(artist);
    await expect(
      createArtwork({
        title: `betest ${tid("t")}`,
        imageUrl: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/artwall/artwork/x.jpg`,
        isPublic: true,
      })
      // createArtwork returns a FormResult (merged from Frontend Phase 2's
      // form-result.ts) rather than void — { ok: true } is success.
    ).resolves.toEqual({ ok: true });
  });

  it("createArtwork refuses to go public without an image, and logs the denial", async () => {
    const artist = await makeUser();
    actAs(artist);
    const title = `betest ${tid("t")}`;
    await expect(createArtwork({ title, isPublic: true })).rejects.toThrow(/not eligible to publish/i);

    const logged = await q<{ allowed: boolean; reasons: string[] }>(
      `select allowed, reasons from policy_decisions where gate = 'canPublishArtwork' and actor_id = $1 order by decided_at desc limit 1`,
      [artist.id]
    );
    expect(logged[0]?.allowed).toBe(false);
    expect(logged[0]?.reasons).toContain("ARTWORK_NOT_PUBLISHED");

    // And the row itself, if created at all, must not be public.
    const rows = await q<{ isPublic: boolean }>(`select "isPublic" from artworks where title = $1`, [title]);
    expect(rows).toHaveLength(0);
  });

  it("createArtwork with isPublic: false never calls the gate (a draft needs no title/image check)", async () => {
    const artist = await makeUser();
    actAs(artist);
    await expect(createArtwork({ title: `betest ${tid("t")}`, isPublic: false })).resolves.toEqual({ ok: true });
  });

  it("setArtworkPublic refuses to flip an imageless work public, and the row stays private", async () => {
    const artist = await makeUser();
    actAs(artist);
    const title = `betest ${tid("t")}`;
    await createArtwork({ title, isPublic: false });
    const [{ id }] = await q<{ id: string }>(`select id from artworks where title = $1`, [title]);

    await expect(setArtworkPublic(id, true)).rejects.toThrow(/not eligible to publish/i);
    const [row] = await q<{ isPublic: boolean }>(`select "isPublic" from artworks where id = $1`, [id]);
    expect(row.isPublic).toBe(false);
  });

  it("setArtworkPublic allows publishing once the work has an image, and unpublishing is never gated", async () => {
    const artist = await makeUser();
    actAs(artist);
    const title = `betest ${tid("t")}`;
    await createArtwork({
      title,
      imageUrl: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/artwall/artwork/y.jpg`,
      isPublic: false,
    });
    const [{ id }] = await q<{ id: string }>(`select id from artworks where title = $1`, [title]);

    const published = await setArtworkPublic(id, true);
    expect(published.isPublic).toBe(true);
    const [afterPublish] = await q<{ lifecycle_status: string }>(
      `select lifecycle_status from artworks where id = $1`,
      [id]
    );
    expect(afterPublish.lifecycle_status).toBe("published");

    const unpublished = await setArtworkPublic(id, false);
    expect(unpublished.isPublic).toBe(false);
  });
});
