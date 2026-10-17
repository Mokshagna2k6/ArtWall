"use client";

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
 */
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

  return (
    <group>
      {/* Floor slab and ceiling for this level. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
        <planeGeometry args={[ROOM_HALF * 2, ROOM_HALF * 2]} />
        <meshStandardMaterial color="#f2f0ec" />
      </mesh>
      <pointLight position={[0, y + FLOOR_HEIGHT - 0.6, 0]} intensity={30} decay={2} />

      {floor.walls.map((wall, wallIndex) => {
        const pose = wallPose(wallIndex, floor.level);
        return (
          <group key={wall.id}>
            {/* The wall surface itself, raised to sit on this floor's slab. */}
            <mesh
              position={[pose.position[0], y + FLOOR_HEIGHT / 2, pose.position[2]]}
              rotation={[0, pose.rotationY, 0]}
            >
              <planeGeometry args={[ROOM_HALF * 2, FLOOR_HEIGHT]} />
              <meshStandardMaterial color="#e8e5e0" />
            </mesh>

            {wall.slots.map((slot, slotIndex) => {
              const slotAt = slotPose(wallIndex, floor.level, slotIndex, wall.slots.length);
              // Nudge off the wall so the frame does not z-fight the surface.
              const position: [number, number, number] = [
                slotAt.position[0] + Math.sin(slotAt.rotationY) * 0.03,
                slotAt.position[1],
                slotAt.position[2] + Math.cos(slotAt.rotationY) * 0.03,
              ];

              if (!slot.artwork) {
                return (
                  <mesh
                    key={slot.id}
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
                      transparent
                      opacity={selectableEmptySlots ? 0.9 : 0.5}
                    />
                  </mesh>
                );
              }

              return (
                <ArtworkFrame
                  key={slot.id}
                  imageUrl={slot.artwork.imageUrl}
                  title={slot.artwork.title}
                  placement={{ position, rotationY: slotAt.rotationY }}
                  onSelect={() => onSelectSlot(slot.id, slot.artwork!.id)}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
