import { afterAll, describe, expect, it } from "vitest";

import { makeArtwork, makeProfile, makeUser, purgeTestData } from "@/test/fixtures";
import { discoverArtworks, getArtworkDetail } from "@/features/marketplace/actions";

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

    const ids = async (f: Parameters<typeof discoverArtworks>[0]) => (await discoverArtworks(f)).map((a) => a.id).sort();

    expect(await ids({ category: tag })).toEqual([cheap, mid, dear, unpriced].sort());
    expect(await ids({ category: tag, minPrice: 50_000, maxPrice: 150_000 })).toEqual([cheap, mid].sort());
    expect(await ids({ category: tag, minPrice: 150_001 })).toEqual([dear]);
    expect(await ids({ category: `${tag}x` })).toEqual([otherCat]);
    expect(await getArtworkDetail(unpublished)).toBeNull();
    expect(await getArtworkDetail(mid)).not.toBeNull();
  });
});
