import { afterAll, describe, expect, it } from "vitest";

import { makeArtwork, makeProfile, makeUser, purgeTestData } from "@/test/fixtures";
import {
  discoverArtworks,
  getArtworkDetail,
  type MarketplaceFilters,
  type MarketplaceSort,
} from "@/features/marketplace/actions";
import { pool } from "@/lib/db/index";

afterAll(purgeTestData);

describe("marketplace filters (BE-1.21 / 1.22)", () => {
  it("filters by category and inclusive paise price bounds; hides unpublished artists", async () => {
    const pub = await makeUser();
    await makeProfile(pub.id, { published: true });
    const hidden = await makeUser();
    await makeProfile(hidden.id, { published: false });

    const tag = `betestcat${Date.now()}`;
    const cheap = await makeArtwork(pub.id, { category: tag, pricePaise: 50_000 });
    const mid = await makeArtwork(pub.id, { category: tag, pricePaise: 150_000 });
    const dear = await makeArtwork(pub.id, { category: tag, pricePaise: 900_000 });
    const unpriced = await makeArtwork(pub.id, { category: tag, pricePaise: null });
    const otherCat = await makeArtwork(pub.id, { category: `${tag}x`, pricePaise: 150_000 });
    const unpublished = await makeArtwork(hidden.id, { category: tag, pricePaise: 150_000 });

    const ids = async (f: MarketplaceFilters) => (await discoverArtworks(f)).items.map((a) => a.id).sort();

    expect(await ids({ category: tag })).toEqual([cheap, mid, dear, unpriced].sort());
    expect(await ids({ category: tag, minPrice: 50_000, maxPrice: 150_000 })).toEqual([cheap, mid].sort());
    expect(await ids({ category: tag, minPrice: 150_001 })).toEqual([dear]);
    expect(await ids({ category: `${tag}x` })).toEqual([otherCat]);
    expect(await getArtworkDetail(unpublished)).toBeNull();
    expect(await getArtworkDetail(mid)).not.toBeNull();
  });
});

describe("marketplace keyset pagination (PERF-1.07)", () => {
  it("pages through every listing exactly once, for every sort, across ties and nulls", async () => {
    const user = await makeUser();
    await makeProfile(user.id, { published: true });
    const tag = `betestpage${Date.now()}`;

    // Duplicate titles, duplicate prices, unpriced works and identical
    // createdAt values (with microseconds a JS Date cannot hold) - every tie
    // the cursor has to break on id.
    const spec: [string, number | null][] = [
      ["B", 100], ["A", 100], ["A", null], ["C", 300], ["D", null], ["E", 200], ["F", 100],
    ];
    const ids: string[] = [];
    for (const [title, pricePaise] of spec) {
      ids.push(await makeArtwork(user.id, { category: tag, title, pricePaise }));
    }
    await pool.query(
      `update artworks set "createdAt" = '2026-01-01 00:00:00.123456' where id = any($1)`,
      [ids.slice(0, 4)]
    );

    for (const sort of ["recent", "title", "price_asc", "price_desc"] as MarketplaceSort[]) {
      const all = (await discoverArtworks({ category: tag, sort, limit: 96 })).items.map((i) => i.id);
      expect(all.sort()).toEqual([...ids].sort());
      const expected = (await discoverArtworks({ category: tag, sort, limit: 96 })).items.map((i) => i.id);

      const paged: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page = await discoverArtworks({ category: tag, sort, limit: 2, cursor });
        expect(page.items.length).toBeLessThanOrEqual(2);
        paged.push(...page.items.map((i) => i.id));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < 10);

      expect(paged, sort).toEqual(expected);
      expect(pages).toBe(4); // 7 rows / 2 per page, and no empty trailing page
    }

    // Unpriced works come last in both price orders.
    const asc = (await discoverArtworks({ category: tag, sort: "price_asc" })).items;
    expect(asc.slice(-2).every((i) => i.pricePaise === null)).toBe(true);
    const descItems = (await discoverArtworks({ category: tag, sort: "price_desc" })).items;
    expect(descItems.map((i) => i.pricePaise).slice(0, 2)).toEqual([300, 200]);

    // A garbage cursor, or one from another sort, falls back to the first page.
    const first = await discoverArtworks({ category: tag, sort: "title", limit: 2 });
    expect((await discoverArtworks({ category: tag, sort: "title", limit: 2, cursor: "!!" })).items).toEqual(first.items);
    const recentCursor = (await discoverArtworks({ category: tag, sort: "recent", limit: 2 })).nextCursor;
    expect((await discoverArtworks({ category: tag, sort: "title", limit: 2, cursor: recentCursor })).items).toEqual(first.items);
  });
});
