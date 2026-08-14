import "server-only";

import { unstable_cache } from "next/cache";

import {
  countWallTiles,
  listRecentJoins,
  listWallTiles,
} from "@/features/wall/store";

export const WALL_TAG = "wall-tiles";

/**
 * The wall, cached and tag-invalidated.
 *
 * The wall is read on every visit and written perhaps a few times a day, so
 * querying per request would be the wrong trade. Publishing calls `updateTag`,
 * which is read-your-own-writes: the artist who just uploaded sees their own
 * work on the wall on the very next render, not after a stale window. The
 * time-based ceiling only covers writes that happen outside the app.
 */
export const getWallTiles = unstable_cache(
  async () => listWallTiles(),
  ["wall-tiles"],
  { tags: [WALL_TAG], revalidate: 300 }
);

export const getRecentJoins = unstable_cache(
  async () => listRecentJoins(),
  ["wall-recent-joins"],
  { tags: [WALL_TAG], revalidate: 300 }
);

export const getWallCount = unstable_cache(
  async () => countWallTiles(),
  ["wall-tile-count"],
  { tags: [WALL_TAG], revalidate: 300 }
);

/**
 * How many real works must hang before the genesis art steps aside entirely.
 *
 * The narrative the wall tells - "ours on loan, until yours arrives" - only
 * pays off if there is a moment where the loan ends. Below this the two are
 * mixed; at or above it, the wall is nothing but artists.
 */
export const GENESIS_RETIREMENT_THRESHOLD = 24;
