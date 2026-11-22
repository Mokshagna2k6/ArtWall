import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeArtwork, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import {
  acceptOffer,
  counterOffer,
  declineOffer,
  getDemandSignal,
  listMyOfferThreads,
  makeOffer,
} from "@/features/offers/actions";

/**
 * The offer feature's three gated rules (Bible §17 Part 1), end to end against
 * a real database: the 50% minimum, the 7/14/30 validity, and the maximum of
 * two counter rounds. `rules.test.ts` covers the arithmetic; this covers what
 * the actions and the schema actually do with it.
 *
 * Privacy (Bible §44, rule 40) gets its own block: the public demand signal
 * must never carry a buyer id or an individual offer.
 */

afterAll(purgeTestData);

const ASK = 100_000; // ₹1000

async function scene() {
  const artist = await makeUser();
  const buyer = await makeUser();
  const artworkId = await makeArtwork(artist.id, { pricePaise: ASK });
  return { artist, buyer, artworkId };
}

beforeEach(() => actAs(null));

describe("the 50% minimum", () => {
  it("refuses an offer below half the asking price", async () => {
    const { buyer, artworkId } = await scene();
    actAs(buyer);

    const result = await makeOffer({ artworkId, amountPaise: 49_999, validityDays: 7 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/50%/);

    const rows = await q(`select 1 from artwork_offers where artwork_id = $1`, [artworkId]);
    expect(rows).toHaveLength(0);
  });

  it("accepts exactly half", async () => {
    const { buyer, artworkId } = await scene();
    actAs(buyer);
    expect((await makeOffer({ artworkId, amountPaise: 50_000, validityDays: 7 })).ok).toBe(true);
  });

  it("is enforced by the database too, not only the action", async () => {
    const { artist, buyer, artworkId } = await scene();
    // The insert the action would do, with the rule skipped.
    await expect(
      q(
        `insert into artwork_offers
           (id, thread_id, artwork_id, buyer_id, seller_id, kind, round, author_side,
            offer_amount_paise, asking_price_paise, expires_at)
         values ($1, $1, $2, $3, $4, 'offer', 0, 'buyer', 1000, $5, now() + interval '7 days')`,
        [tid("ofr"), artworkId, buyer.id, artist.id, ASK]
      )
    ).rejects.toThrow(/artwork_offers_min_half/);
  });

  it("refuses an offer on the buyer's own work", async () => {
    const { artist, artworkId } = await scene();
    actAs(artist);
    const result = await makeOffer({ artworkId, amountPaise: 90_000, validityDays: 7 });
    expect(result.ok).toBe(false);
  });
});

describe("validity windows", () => {
  it("stores the chosen window as a real expiry", async () => {
    const { buyer, artworkId } = await scene();
    actAs(buyer);
    const result = await makeOffer({ artworkId, amountPaise: 60_000, validityDays: 30 });
    expect(result.ok).toBe(true);

    const [row] = await q<{ days: string }>(
      `select round(extract(epoch from (expires_at - created_at)) / 86400) as days
         from artwork_offers where artwork_id = $1 and round = 0`,
      [artworkId]
    );
    expect(Number(row.days)).toBe(30);
  });

  it("refuses a validity the Bible does not list", async () => {
    const { buyer, artworkId } = await scene();
    actAs(buyer);
    const result = await makeOffer({
      artworkId,
      amountPaise: 60_000,
      // 10 days is not 7, 14 or 30.
      validityDays: 10 as never,
    });
    expect(result.ok).toBe(false);
  });
});

describe("the 2-counter-round ceiling", () => {
  it("allows two counters and refuses the third, closing the thread", async () => {
    const { artist, buyer, artworkId } = await scene();

    actAs(buyer);
    const opened = await makeOffer({ artworkId, amountPaise: 60_000, validityDays: 14 });
    expect(opened.ok).toBe(true);
    const threadId = opened.ok ? opened.data.threadId : "";

    // Round 1 — the artist counters.
    actAs(artist);
    const first = await counterOffer({ threadId, amountPaise: 85_000 });
    expect(first.ok && first.data.round).toBe(1);

    // Round 2 — the buyer counters back. This is the last legal move.
    actAs(buyer);
    const second = await counterOffer({ threadId, amountPaise: 70_000 });
    expect(second.ok && second.data.round).toBe(2);

    // Round 3 — refused, and the thread is closed rather than left pending.
    actAs(artist);
    const third = await counterOffer({ threadId, amountPaise: 80_000 });
    expect(third.ok).toBe(false);
    expect(third.ok === false && third.error).toMatch(/both counter-offers|closed/i);

    const [head] = await q<{ status: string }>(
      `select status from artwork_offers where thread_id = $1 and round = 0`,
      [threadId]
    );
    expect(head.status).toBe("expired");

    const rows = await q(`select 1 from artwork_offers where thread_id = $1`, [threadId]);
    expect(rows).toHaveLength(3); // opening + exactly two counters
  });

  it("is enforced by the database too: round 3 cannot be inserted", async () => {
    const { artist, buyer, artworkId } = await scene();
    await expect(
      q(
        `insert into artwork_offers
           (id, thread_id, artwork_id, buyer_id, seller_id, kind, round, author_side,
            offer_amount_paise, asking_price_paise, expires_at)
         values ($1, $1, $2, $3, $4, 'counter', 3, 'seller', 90000, $5, now() + interval '7 days')`,
        [tid("ofr"), artworkId, buyer.id, artist.id, ASK]
      )
    ).rejects.toThrow(/artwork_offers_round/);
  });

  it("refuses a counter from the side that wrote the live message", async () => {
    const { buyer, artworkId } = await scene();
    actAs(buyer);
    const opened = await makeOffer({ artworkId, amountPaise: 60_000, validityDays: 7 });
    const threadId = opened.ok ? opened.data.threadId : "";

    // The buyer just offered; they cannot counter themselves.
    const result = await counterOffer({ threadId, amountPaise: 65_000 });
    expect(result.ok).toBe(false);
  });

  it("refuses a counter under the 50% floor", async () => {
    const { artist, buyer, artworkId } = await scene();
    actAs(buyer);
    const opened = await makeOffer({ artworkId, amountPaise: 60_000, validityDays: 7 });
    const threadId = opened.ok ? opened.data.threadId : "";

    actAs(artist);
    const result = await counterOffer({ threadId, amountPaise: 10_000 });
    expect(result.ok).toBe(false);
  });
});

describe("accept and decline", () => {
  it("accepting closes the thread at the live amount", async () => {
    const { artist, buyer, artworkId } = await scene();
    actAs(buyer);
    const opened = await makeOffer({ artworkId, amountPaise: 75_000, validityDays: 7 });
    const threadId = opened.ok ? opened.data.threadId : "";

    actAs(artist);
    const accepted = await acceptOffer(threadId);
    expect(accepted.ok && accepted.data.amountPaise).toBe(75_000);

    const [head] = await q<{ status: string }>(
      `select status from artwork_offers where thread_id = $1 and round = 0`,
      [threadId]
    );
    expect(head.status).toBe("accepted");
  });

  it("a stranger can neither accept nor decline", async () => {
    const { buyer, artworkId } = await scene();
    actAs(buyer);
    const opened = await makeOffer({ artworkId, amountPaise: 75_000, validityDays: 7 });
    const threadId = opened.ok ? opened.data.threadId : "";

    const stranger = await makeUser();
    actAs(stranger);
    expect((await acceptOffer(threadId)).ok).toBe(false);
    expect((await declineOffer(threadId)).ok).toBe(false);
  });

  it("a declined thread cannot then be accepted", async () => {
    const { artist, buyer, artworkId } = await scene();
    actAs(buyer);
    const opened = await makeOffer({ artworkId, amountPaise: 75_000, validityDays: 7 });
    const threadId = opened.ok ? opened.data.threadId : "";

    actAs(artist);
    expect((await declineOffer(threadId)).ok).toBe(true);
    expect((await acceptOffer(threadId)).ok).toBe(false);
  });
});

describe("the public demand signal (Bible §44, rule 40)", () => {
  it("reports count, range and recency — and never a buyer or an exact offer", async () => {
    const { artworkId } = await scene();

    for (const amount of [55_000, 80_000, 65_000]) {
      const buyer = await makeUser();
      actAs(buyer);
      const result = await makeOffer({ artworkId, amountPaise: amount, validityDays: 7 });
      expect(result.ok).toBe(true);
    }

    actAs(null); // a signed-out visitor
    const demand = await getDemandSignal(artworkId);

    expect(demand.offerCount).toBe(3);
    expect(demand.lowPaise).toBe(55_000);
    expect(demand.highPaise).toBe(80_000);
    expect(demand.latestOfferAt).toBeInstanceOf(Date);

    // The whole payload, serialised: no user id, no "betest_" fixture id, and
    // no key that could carry one.
    const serialised = JSON.stringify(demand);
    expect(serialised).not.toMatch(/betest_/);
    expect(Object.keys(demand).sort()).toEqual([
      "highPaise",
      "latestOfferAt",
      "lowPaise",
      "offerCount",
    ]);
  });

  it("counts one signal per negotiation, not one per message", async () => {
    const { artist, buyer, artworkId } = await scene();
    actAs(buyer);
    const opened = await makeOffer({ artworkId, amountPaise: 60_000, validityDays: 7 });
    const threadId = opened.ok ? opened.data.threadId : "";

    actAs(artist);
    await counterOffer({ threadId, amountPaise: 90_000 });

    actAs(null);
    expect((await getDemandSignal(artworkId)).offerCount).toBe(1);
  });

  it("the artist's own thread view names no buyer either", async () => {
    const { artist, buyer, artworkId } = await scene();
    actAs(buyer);
    await makeOffer({ artworkId, amountPaise: 60_000, validityDays: 7 });

    actAs(artist);
    const threads = await listMyOfferThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0].viewerSide).toBe("seller");
    // The artist sees the amount and whose turn it is, never who is bidding.
    // The counterpart is revealed by the ORDER, once an offer is accepted.
    expect(JSON.stringify(threads[0])).not.toMatch(buyer.id);
  });

  it("shows a buyer only their own threads", async () => {
    const { buyer, artworkId } = await scene();
    actAs(buyer);
    await makeOffer({ artworkId, amountPaise: 60_000, validityDays: 7 });

    const stranger = await makeUser();
    actAs(stranger);
    expect(await listMyOfferThreads()).toHaveLength(0);
  });

  it("is empty for a work nobody has offered on", async () => {
    const { artworkId } = await scene();
    actAs(null);
    const demand = await getDemandSignal(artworkId);
    expect(demand.offerCount).toBe(0);
    expect(demand.lowPaise).toBeNull();
  });
});

describe("signed-out and ownership", () => {
  it("a signed-out visitor cannot make an offer", async () => {
    const { artworkId } = await scene();
    actAs(null);
    expect((await makeOffer({ artworkId, amountPaise: 90_000, validityDays: 7 })).ok).toBe(false);
  });

  it("refuses a work with no asking price", async () => {
    const artist = await makeUser();
    const buyer = await makeUser();
    const artworkId = await makeArtwork(artist.id, { pricePaise: null });
    actAs(buyer);
    const result = await makeOffer({ artworkId, amountPaise: 90_000, validityDays: 7 });
    expect(result.ok).toBe(false);
  });

  it("refuses a second open offer from the same buyer", async () => {
    const { buyer, artworkId } = await scene();
    actAs(buyer);
    expect((await makeOffer({ artworkId, amountPaise: 60_000, validityDays: 7 })).ok).toBe(true);
    expect((await makeOffer({ artworkId, amountPaise: 70_000, validityDays: 7 })).ok).toBe(false);
  });
});
