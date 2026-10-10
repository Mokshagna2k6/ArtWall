/**
 * FE-3.08: the six standard 3D exhibition templates.
 *
 * A template is nothing more than a function from "the Nth of M artworks" to
 * a wall placement (position + facing angle) — the room geometry itself
 * (floor, walls, lighting) is shared and lives in `room.tsx`. Custom
 * templates are MVP-deferred per the task list, so this stays a closed set
 * of six, not a plugin system.
 *
 * `exhibitions.template` has no column yet (not part of any Phase-3 table
 * this worktree owns) — the selection lives in client state only until a
 * migration adds one. Marked for reconciliation at merge time.
 */

export type ExhibitionTemplate =
  | "single-wall"
  | "rectangular-room"
  | "circular-gallery"
  | "l-shaped"
  | "corridor"
  | "atrium";

export const TEMPLATES: { id: ExhibitionTemplate; label: string }[] = [
  { id: "single-wall", label: "Single wall" },
  { id: "rectangular-room", label: "Rectangular room" },
  { id: "circular-gallery", label: "Circular gallery" },
  { id: "l-shaped", label: "L-shaped room" },
  { id: "corridor", label: "Corridor" },
  { id: "atrium", label: "Atrium" },
];

export interface Placement {
  position: [number, number, number];
  rotationY: number;
}

const FRAME_GAP = 3;
const WALL_HEIGHT = 1.6;

/** Evenly spaces `count` frames along a wall of the given length, centred. */
function alongWall(
  index: number,
  count: number,
  wallLength: number
): number {
  if (count === 1) return 0;
  const span = Math.min(wallLength, (count - 1) * FRAME_GAP);
  const step = span / (count - 1);
  return -span / 2 + index * step;
}

export function placeArtwork(
  template: ExhibitionTemplate,
  index: number,
  count: number
): Placement {
  switch (template) {
    case "single-wall":
      return { position: [alongWall(index, count, 20), WALL_HEIGHT, -5], rotationY: 0 };

    case "rectangular-room": {
      const perWall = Math.ceil(count / 4);
      const side = Math.floor(index / perWall);
      const posInWall = index % perWall;
      const offset = alongWall(posInWall, perWall, 8);
      const walls: Placement[] = [
        { position: [offset, WALL_HEIGHT, -5], rotationY: 0 },
        { position: [5, WALL_HEIGHT, offset], rotationY: -Math.PI / 2 },
        { position: [offset, WALL_HEIGHT, 5], rotationY: Math.PI },
        { position: [-5, WALL_HEIGHT, offset], rotationY: Math.PI / 2 },
      ];
      return walls[side % 4];
    }

    case "circular-gallery": {
      const radius = 6;
      const angle = (index / count) * Math.PI * 2;
      return {
        position: [Math.sin(angle) * radius, WALL_HEIGHT, -Math.cos(angle) * radius],
        rotationY: angle + Math.PI,
      };
    }

    case "l-shaped": {
      const perLeg = Math.ceil(count / 2);
      const leg = Math.floor(index / perLeg);
      const posInLeg = index % perLeg;
      const offset = alongWall(posInLeg, perLeg, 9);
      return leg === 0
        ? { position: [offset, WALL_HEIGHT, -5], rotationY: 0 }
        : { position: [5, WALL_HEIGHT, offset - 5], rotationY: -Math.PI / 2 };
    }

    case "corridor": {
      const side = index % 2;
      const posAlong = Math.floor(index / 2);
      const total = Math.ceil(count / 2);
      const z = alongWall(posAlong, total, 24);
      return side === 0
        ? { position: [-3, WALL_HEIGHT, z], rotationY: Math.PI / 2 }
        : { position: [3, WALL_HEIGHT, z], rotationY: -Math.PI / 2 };
    }

    case "atrium": {
      const radius = 4 + Math.floor(index / 8) * 3;
      const perRing = 8;
      const angle = ((index % perRing) / perRing) * Math.PI * 2;
      return {
        position: [Math.sin(angle) * radius, WALL_HEIGHT, -Math.cos(angle) * radius],
        rotationY: angle + Math.PI,
      };
    }
  }
}
