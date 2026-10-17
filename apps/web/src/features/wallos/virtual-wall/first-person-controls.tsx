"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";

import { EYE_HEIGHT, FLOOR_HEIGHT, ROOM_HALF } from "@/features/wallos/virtual-wall/layout";

/**
 * WASD + pointer-lock mouselook, per Bible §15 (the reference site's own
 * control scheme could not be determined — see
 * docs/VIRTUAL-WALL-RESEARCH.md §3).
 *
 * Deliberately not a physics engine: movement is a clamped position integration
 * on one floor's plane. The visitor cannot fall, cannot leave the room, and
 * changes floor through the HUD rather than by finding stairs — which is also
 * what keeps this usable on a phone, where there is no pointer lock at all.
 */
export function FirstPersonControls({
  floorLevel,
  enabled,
  onLockChange,
}: {
  floorLevel: number;
  enabled: boolean;
  onLockChange?: (locked: boolean) => void;
}) {
  // `get()` rather than destructuring `camera`: the camera is mutated every
  // frame, and React Compiler's immutability rule (rightly) forbids writing to
  // a value a hook returned. Reading it through the store's getter inside the
  // callback keeps the mutation out of render-tracked state.
  const get = useThree((state) => state.get);
  const keys = useRef<Set<string>>(new Set());

  // Keyup must fire even when the pointer is locked, and must be cleared on
  // unmount or the visitor keeps walking after leaving the view.
  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      keys.current.clear();
    };
  }, []);

  // Changing floor teleports the eye to that slab rather than animating: the
  // floors are stacked in one scene, so this is a Y move, not a new scene.
  const eyeY = floorLevel * FLOOR_HEIGHT + EYE_HEIGHT;
  useEffect(() => {
    get().camera.position.set(0, eyeY, 0);
  }, [get, eyeY]);

  useFrame((state, delta) => {
    const camera = state.camera;
    const held = keys.current;
    // Cap delta: a backgrounded tab resumes with a huge delta and would
    // otherwise teleport the visitor through a wall on the first frame.
    const step = Math.min(delta, 0.1) * 4;

    const f =
      (held.has("KeyW") || held.has("ArrowUp") ? 1 : 0) -
      (held.has("KeyS") || held.has("ArrowDown") ? 1 : 0);
    const r =
      (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0) -
      (held.has("KeyA") || held.has("ArrowLeft") ? 1 : 0);
    if (f === 0 && r === 0) return;

    // Heading on the XZ plane straight from the camera's yaw. Done with plain
    // trigonometry rather than THREE.Vector3 maths because `three` ships no
    // type declarations in this project (@types/three is not installed) and
    // the whole feature is "walk on a flat floor" — no vertical look
    // component to project away, nothing a vector class would do better.
    const yaw = camera.rotation.y;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);

    // Forward is -Z rotated by yaw; strafe is forward turned 90 degrees.
    camera.position.x += (-sin * f + cos * r) * step;
    camera.position.z += (-cos * f - sin * r) * step;

    // Stay inside the room and on this floor's slab.
    const limit = ROOM_HALF - 0.6;
    camera.position.x = Math.max(-limit, Math.min(limit, camera.position.x));
    camera.position.z = Math.max(-limit, Math.min(limit, camera.position.z));
    camera.position.y = eyeY;
  });

  if (!enabled) return null;
  return (
    <PointerLockControls
      makeDefault
      onLock={() => onLockChange?.(true)}
      onUnlock={() => onLockChange?.(false)}
    />
  );
}
