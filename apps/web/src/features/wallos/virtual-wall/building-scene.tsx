"use client";

import { ContactShadows } from "@react-three/drei";

import { ArtworkFrame } from "@/features/exhibitions/viewer3d/artwork-frame";
import {
  FLOOR_HEIGHT,
  ROOM_HALF,
  slotPose,
  wallPose,
} from "@/features/wallos/virtual-wall/layout";
import type { VirtualFloor } from "@/features/wallos/virtual-wall/actions";

/**
 * One floor of the building, drawn from its hierarchy rows.
 *
 * Reuses `ArtworkFrame` from the existing exhibition viewer unchanged — it
 * already does the Cloudinary texture, the hover label and the click target,
 * and its `Placement` type is structurally the same as our `WallPose`. An
 * empty slot (Rule 21) renders as a bare wall plate with no frame: visible as
 * a hanging position, carrying no artwork identity.
 *
 * Architecture rather than flat planes: the room is a box (slab, four walls,
 * coffered ceiling with a skylight), the walls carry a skirting and a picture
 * rail, and each artwork sits in a real box frame with depth. Everything is
 * still *derived* from `layout.ts`, so adding a wall row in WallOS still just
 * works.
 *
 * Performance: one floor is mounted at a time (see virtual-wall-viewer), all
 * geometry is box/plane primitives, and only the one directional light casts
 * shadows — a 1024 map, which is what a mid-range Android can afford at 30fps.
 */

/** Warm gallery white, used for every architectural surface. */
const WALL_COLOR = "#edeae4";
/** The painted band at the base of a wall and the picture rail above it. */
const TRIM_COLOR = "#d9d4cb";

export function FloorScene({
  floor,
  onSelectSlot,
  selectableEmptySlots,
}: {
  floor: VirtualFloor;
  onSelectSlot: (slotId: string, artworkId: string | null) => void;
  /** Super Admin only: makes empty slots clickable so they can be filled. */
  selectableEmptySlots: boolean;
}) {
  const y = floor.level * FLOOR_HEIGHT;
  const span = ROOM_HALF * 2;
  const ceilingY = y + FLOOR_HEIGHT;

  return (
    <group>
      {/* Polished stone slab. Low roughness + a little metalness is what reads
          as a gallery floor rather than paper. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
        <planeGeometry args={[span, span]} />
        <meshStandardMaterial color="#e6e3dd" roughness={0.35} metalness={0.05} />
      </mesh>

      {/* Ceiling, with a square skylight cut as four border slabs rather than a
          CSG hole — four boxes are cheaper than a shaped geometry and the sky
          shows through the gap exactly the same. */}
      <Ceiling y={ceilingY} half={ROOM_HALF} />

      {/* Daylight through the skylight: one shadow-casting key light. */}
      <directionalLight
        position={[6, ceilingY + 8, 4]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-ROOM_HALF}
        shadow-camera-right={ROOM_HALF}
        shadow-camera-top={ROOM_HALF}
        shadow-camera-bottom={-ROOM_HALF}
        shadow-camera-near={1}
        shadow-camera-far={ceilingY + 20}
      />
      {/* Bounce off the pale floor, so the undersides are not black. */}
      <hemisphereLight args={["#ffffff", "#cfc8bd", 1.1]} position={[0, ceilingY, 0]} />
      {/* The room's own ceiling wash. */}
      <pointLight position={[0, ceilingY - 0.5, 0]} intensity={26} decay={2} color="#fff6e8" />

      {/* Grounds the frames and the visitor; a soft blur, computed once. */}
      <ContactShadows
        position={[0, y + 0.01, 0]}
        scale={span}
        resolution={512}
        blur={2.5}
        opacity={0.35}
        far={FLOOR_HEIGHT}
        frames={1}
      />

      {floor.walls.map((wall, wallIndex) => {
        const pose = wallPose(wallIndex, floor.level);
        // Into-the-room direction for this wall, used to offset everything that
        // must sit proud of its surface (trim, frames) without z-fighting.
        const nx = Math.sin(pose.rotationY);
        const nz = Math.cos(pose.rotationY);

        return (
          <group key={wall.id}>
            {/* The wall as a solid slab, not a plane: it has a visible edge
                where it meets the floor and ceiling. */}
            <mesh
              position={[pose.position[0], y + FLOOR_HEIGHT / 2, pose.position[2]]}
              rotation={[0, pose.rotationY, 0]}
              receiveShadow
            >
              <boxGeometry args={[span, FLOOR_HEIGHT, 0.25]} />
              <meshStandardMaterial color={WALL_COLOR} roughness={0.92} />
            </mesh>

            {/* Skirting board and picture rail. */}
            {[0.1, FLOOR_HEIGHT - 0.55].map((offsetY, i) => (
              <mesh
                key={i}
                position={[
                  pose.position[0] + nx * 0.14,
                  y + offsetY,
                  pose.position[2] + nz * 0.14,
                ]}
                rotation={[0, pose.rotationY, 0]}
              >
                <boxGeometry args={[span, i === 0 ? 0.2 : 0.06, 0.05]} />
                <meshStandardMaterial color={TRIM_COLOR} roughness={0.8} />
              </mesh>
            ))}

            {wall.slots.map((slot, slotIndex) => {
              const slotAt = slotPose(wallIndex, floor.level, slotIndex, wall.slots.length);
              // Clear of the wall slab's own half-depth plus its trim.
              const position: [number, number, number] = [
                slotAt.position[0] + nx * 0.14,
                slotAt.position[1],
                slotAt.position[2] + nz * 0.14,
              ];

              // A small picture light over every hanging position, empty or
              // not — a gallery lights the wall, not the painting.
              const spot = (
                <pointLight
                  position={[
                    position[0] + nx * 0.5,
                    position[1] + 1.0,
                    position[2] + nz * 0.5,
                  ]}
                  intensity={2.2}
                  distance={3.4}
                  decay={2}
                  color="#fff3e2"
                />
              );

              if (!slot.artwork) {
                return (
                  <group
                    key={slot.id}
                    userData={{ slotId: slot.id, artworkId: null }}
                  >
                    {spot}
                    <mesh
                      position={position}
                      rotation={[0, slotAt.rotationY, 0]}
                      onClick={
                        selectableEmptySlots
                          ? (event) => {
                              event.stopPropagation();
                              onSelectSlot(slot.id, null);
                            }
                          : undefined
                      }
                    >
                      <planeGeometry args={[1.5, 1.1]} />
                      <meshStandardMaterial
                        color={selectableEmptySlots ? "#cfd8dc" : "#e3e0db"}
                        roughness={0.9}
                        transparent
                        opacity={selectableEmptySlots ? 0.9 : 0.5}
                      />
                    </mesh>
                  </group>
                );
              }

              return (
                <group
                  key={slot.id}
                  userData={{ slotId: slot.id, artworkId: slot.artwork.id }}
                >
                  {spot}
                  <ArtworkFrame
                    imageUrl={slot.artwork.imageUrl}
                    title={slot.artwork.title}
                    artistName={slot.artwork.artistName ?? slot.artwork.artistHandle}
                    medium={slot.artwork.medium}
                    year={slot.artwork.year}
                    placement={{ position, rotationY: slotAt.rotationY }}
                    onSelect={() => onSelectSlot(slot.id, slot.artwork!.id)}
                  />
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

/**
 * A coffered ceiling with a square skylight in the middle, built from four
 * border slabs around the opening. `half` is the room's half-width.
 */
function Ceiling({ y, half }: { y: number; half: number }) {
  /** Half-width of the skylight opening. */
  const open = half * 0.4;
  const border = half - open;
  // [x, z, width, depth] for the four slabs around the opening.
  const slabs: [number, number, number, number][] = [
    [0, -(open + border / 2), half * 2, border],
    [0, open + border / 2, half * 2, border],
    [-(open + border / 2), 0, border, open * 2],
    [open + border / 2, 0, border, open * 2],
  ];

  return (
    <group>
      {slabs.map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[w, 0.3, d]} />
          <meshStandardMaterial color="#f4f1ec" roughness={0.95} />
        </mesh>
      ))}
      {/* The glazing itself: faintly visible, lets the sky through. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, y, 0]}>
        <planeGeometry args={[open * 2, open * 2]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={0.12}
          roughness={0.1}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}
