import type { WallTile } from "@/features/wall/types";

/**
 * The composition of the wall.
 *
 * A uniform grid reads as a spreadsheet of thumbnails. A real gallery wall is
 * *justified*: rows of mixed portrait, square, and landscape work, each row
 * scaled so its edges line up while no two pieces are the same size. That is
 * what this computes - the arithmetic is separated from the rendering because
 * getting a justified row wrong by a pixel leaves visible gutters, and that is
 * far easier to reason about here than inside a component.
 *
 * Everything is deterministic. `Math.random` is unavailable to us anywhere in
 * this file: the server and the client must lay out byte-identical walls or
 * hydration mismatches, and a returning visitor must find their work where
 * they left it.
 */

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Aspect ratios a gallery actually hangs, with rough real-world frequency. */
const ASPECTS = [
  0.72,
  0.72,
  0.8, // portrait
  1,
  1,
  1, // square
  1.33,
  1.33,
  1.5, // landscape
  1.85, // wide
] as const;

/** Wall width in layout units. Rows are justified to exactly this. */
export const WALL_WIDTH = 2600;

const ROW_HEIGHTS = [190, 230, 270, 310, 210, 250] as const;
const GUTTER = 14;

export interface WallRegion {
  /** Stable identity, and the seed its genesis artwork is drawn from. */
  id: string;
  seed: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** A degree or two of hang-crookedness. Nothing on a real wall is true. */
  tilt: number;
  /** Small forward offset, so frames catch the light at different depths. */
  depth: number;
  /** How much of the room's light this frame catches, 0-1. */
  tone: number;
  /** Colour intensity. Work further from the lamp reads cooler and greyer. */
  saturation: number;
  /** A real artist's work, once one has claimed this region. */
  tile: WallTile | null;
}

export interface WallComposition {
  regions: WallRegion[];
  width: number;
  height: number;
}

/**
 * Spread real works across the whole composition rather than filling from the
 * top-left.
 *
 * Filling in order would stack every founding artist in the first two rows and
 * leave the rest of the wall visibly unclaimed, which reads as an empty
 * product rather than a young one. Scattering means the wall looks inhabited
 * from the very first artist, and each new arrival lands somewhere unexpected.
 */
function scatter(total: number, count: number): number[] {
  if (count <= 0 || total <= 0) return [];
  if (count >= total) return Array.from({ length: total }, (_, i) => i);

  const step = total / count;
  const slots: number[] = [];
  for (let i = 0; i < count; i += 1) {
    slots.push(Math.min(total - 1, Math.floor(i * step + step * 0.5)));
  }
  return slots;
}

/**
 * Build the wall.
 *
 * `capacity` is how many regions to compose in total - the wall is always
 * larger than the community that has filled it, because a wall with no room
 * left says the invitation is closed.
 */
export function composeWall(
  tiles: WallTile[],
  capacity = 220
): WallComposition {
  const random = rng(0x5eed);
  const regions: WallRegion[] = [];

  let y = 0;
  let index = 0;

  while (index < capacity) {
    const targetHeight = ROW_HEIGHTS[Math.floor(random() * ROW_HEIGHTS.length)];

    // Fill a row with mixed aspects until it is at least wall-width wide.
    const row: number[] = [];
    let aspectSum = 0;
    while (
      aspectSum * targetHeight < WALL_WIDTH &&
      index + row.length < capacity
    ) {
      const aspect = ASPECTS[Math.floor(random() * ASPECTS.length)];
      row.push(aspect);
      aspectSum += aspect;
    }
    if (row.length === 0) break;

    // Justify: scale the row's height so its pieces span exactly the wall.
    const gutters = GUTTER * (row.length - 1);
    const height = Math.round((WALL_WIDTH - gutters) / aspectSum);

    let x = 0;
    for (const aspect of row) {
      const width = Math.round(height * aspect);
      regions.push({
        id: `r${index}`,
        seed: (index * 2654435761 + 101) >>> 0,
        x,
        y,
        width,
        height,
        tilt: (random() - 0.5) * 1.6,
        depth: Math.round(random() * 14),
        // Gallery lighting is never even. Varying brightness and saturation
        // per frame is what stops a wall of flat vector shapes from reading as
        // a sticker sheet - it is the single cheapest cue that these are
        // objects hanging in a lit room rather than images in a grid.
        tone: 0.52 + random() * 0.5,
        saturation: 0.66 + random() * 0.42,
        tile: null,
      });
      x += width + GUTTER;
      index += 1;
    }

    y += height + GUTTER;
  }

  // Hand real works to scattered regions.
  const slots = scatter(regions.length, tiles.length);
  slots.forEach((slot, i) => {
    regions[slot].tile = tiles[i];
  });

  return {
    regions,
    width: WALL_WIDTH,
    height: Math.max(0, y - GUTTER),
  };
}

/** Where a given artwork ended up, so the camera can be sent to it. */
export function findRegion(
  composition: WallComposition,
  artworkUrl: string
): WallRegion | null {
  return (
    composition.regions.find(
      (region) => region.tile?.artworkUrl === artworkUrl
    ) ?? null
  );
}
