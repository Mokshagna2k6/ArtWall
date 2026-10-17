/**
 * Virtual Wall — the pure geometry layer.
 *
 * Turns "the Nth wall of a floor" and "the Nth slot of a wall" into positions
 * in a 3D building. No React, no DB, no three.js imports: just arithmetic, so
 * it can be unit-tested and so the client component stays a thin renderer.
 *
 * Why derived instead of stored: the user said block/room definitions come
 * later, and Locked Rule 31/§30-34 already give us the real structure
 * (floors -> rooms/zones -> walls -> slots). Storing x/y/z per wall now would
 * mean a migration today and a second one when real floorplans arrive. So the
 * building is laid out *from the hierarchy itself* — add a wall row in WallOS
 * and it appears in the 3D building with no geometry edit.
 *
 * shortcut: walls are placed on the perimeter of a square room per floor, in
 * hierarchy order, rather than at surveyed coordinates. Upgrade when real
 * floorplan data (wall length/position/orientation) exists on the walls table.
 */

/** Metres between floor slabs. Also the camera's eye travel when changing floor. */
export const FLOOR_HEIGHT = 4;
/** Half-width of a floor's square room: walls sit at +/- this on each axis. */
export const ROOM_HALF = 8;
/** Eye height of a standing visitor, metres. */
export const EYE_HEIGHT = 1.6;
/** Centre height of a hung artwork above its own floor slab, metres. */
const HANG_HEIGHT = 1.7;
/** Metres between slot centres along a wall. */
const SLOT_PITCH = 2.4;

export interface WallPose {
  /** Centre of the wall surface, in world metres. */
  position: [number, number, number];
  /** Rotation about Y so the wall's +Z faces into the room. */
  rotationY: number;
}

/**
 * Where the `index`-th wall of a floor sits. Walls go round the room's four
 * sides in order; a fifth wall starts a second, inner ring so a floor with
 * many walls still lays out instead of overlapping.
 */
export function wallPose(index: number, floorLevel: number): WallPose {
  const ring = Math.floor(index / 4);
  const side = index % 4;
  const half = Math.max(ROOM_HALF - ring * 3, 2);
  const y = floorLevel * FLOOR_HEIGHT;

  switch (side) {
    case 0:
      return { position: [0, y, -half], rotationY: 0 };
    case 1:
      return { position: [half, y, 0], rotationY: -Math.PI / 2 };
    case 2:
      return { position: [0, y, half], rotationY: Math.PI };
    default:
      return { position: [-half, y, 0], rotationY: Math.PI / 2 };
  }
}

/**
 * Offset of the `index`-th of `count` slots along its wall, in metres from the
 * wall's centre. Centred, so a wall with one slot has it in the middle.
 */
export function slotOffset(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * SLOT_PITCH;
}

/** World position + facing of one slot: its wall's pose plus its own offset. */
export function slotPose(
  wallIndex: number,
  floorLevel: number,
  slotIndex: number,
  slotCount: number
): WallPose {
  const wall = wallPose(wallIndex, floorLevel);
  const offset = slotOffset(slotIndex, slotCount);
  // Along-wall direction is the wall's local +X rotated by rotationY.
  const dx = Math.cos(wall.rotationY) * offset;
  const dz = -Math.sin(wall.rotationY) * offset;
  return {
    position: [
      wall.position[0] + dx,
      floorLevel * FLOOR_HEIGHT + HANG_HEIGHT,
      wall.position[2] + dz,
    ],
    rotationY: wall.rotationY,
  };
}

/** Where a visitor's camera starts when they arrive on a floor. */
export function floorSpawn(floorLevel: number): [number, number, number] {
  return [0, floorLevel * FLOOR_HEIGHT + EYE_HEIGHT, 0];
}
