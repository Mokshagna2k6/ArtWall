import { beforeEach, expect, test, vi } from "vitest";

/**
 * The two things the homepage's demand-derived reads have to get right
 * (CHANGES-PLAN.md §4(A)):
 *
 * 1. Rank order survives the second query. The demand tables give ids in
 *    score order; the card data comes from a separate `in (...)` join whose
 *    row order Postgres does not promise. If the join's order won, "Trending"
 *    would be in an arbitrary order while claiming to be a ranking.
 *
 * 2. A sparse or missing demand table degrades to an empty section. These
 *    tables start empty on a fresh database and are not in the Drizzle schema,
 *    so a throw here would be a 500 on the homepage.
 */

/** Rows the fake `in (...)` join returns, deliberately NOT in demand order. */
let joinRows: { id: string; title: string }[] = [];
/** What the fake demand query does: return ids, or blow up. */
let demandResult: () => unknown = () => [];

vi.mock("@/lib/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => {
            const q = Promise.resolve(joinRows) as Promise<unknown> & {
              orderBy: () => unknown;
            };
            // loadNewlyListed chains .orderBy().limit(); the demand readers don't.
            q.orderBy = () => ({ limit: () => Promise.resolve(joinRows) });
            return q;
          },
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/db", () => ({
  getSql: () => () => Promise.resolve(demandResult()),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  joinRows = [];
  demandResult = () => [];
});

test("trending keeps the demand ranking, not the join's row order", async () => {
  demandResult = () => [
    { artwork_id: "c" },
    { artwork_id: "a" },
    { artwork_id: "b" },
  ];
  joinRows = [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
    { id: "c", title: "C" },
  ];

  const { loadTrending } = await import("../marketplace-data");
  const items = await loadTrending(3);

  expect(items.map((i) => i.id)).toEqual(["c", "a", "b"]);
});

test("a scored work that is no longer a public listing drops out", async () => {
  // "gone" has a demand row but no longer matches the listed-artwork join.
  demandResult = () => [{ artwork_id: "gone" }, { artwork_id: "a" }];
  joinRows = [{ id: "a", title: "A" }];

  const { loadTrending } = await import("../marketplace-data");
  expect((await loadTrending(8)).map((i) => i.id)).toEqual(["a"]);
});

test("limit is applied after dead listings are dropped", async () => {
  demandResult = () => [{ artwork_id: "a" }, { artwork_id: "b" }, { artwork_id: "c" }];
  joinRows = [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
    { id: "c", title: "C" },
  ];

  const { loadTrending } = await import("../marketplace-data");
  expect((await loadTrending(2)).map((i) => i.id)).toEqual(["a", "b"]);
});

test("an unavailable demand table renders an empty section, it does not throw", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  demandResult = () => {
    throw new Error('relation "demand_signals" does not exist');
  };

  const { loadRecentlyFavorited, loadTodaysPick, loadTrending } = await import(
    "../marketplace-data"
  );

  await expect(loadTrending()).resolves.toEqual([]);
  await expect(loadRecentlyFavorited()).resolves.toEqual([]);
  await expect(loadTodaysPick()).resolves.toBeNull();
  expect(log).toHaveBeenCalled();
});

test("no demand signals at all means an empty section, with no second query", async () => {
  demandResult = () => [];
  // joinRows stays [] — cardsFor must short-circuit rather than run `in ()`.
  const { loadTrending, loadTodaysPick } = await import("../marketplace-data");
  await expect(loadTrending()).resolves.toEqual([]);
  await expect(loadTodaysPick()).resolves.toBeNull();
});
