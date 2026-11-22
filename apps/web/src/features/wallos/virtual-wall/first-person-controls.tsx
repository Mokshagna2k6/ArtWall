"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";

import { EYE_HEIGHT, FLOOR_HEIGHT, ROOM_HALF } from "@/features/wallos/virtual-wall/layout";

/**
 * WASD + pointer-lock mouselook, per Bible §15 (the reference site's own
 * control scheme could not be determined — see
 * docs/product/VIRTUAL-WALL-RESEARCH.md §3).
 *
 * Deliberately not a physics engine: movement is a clamped position integration
 * on one floor's plane. The visitor cannot fall, cannot leave the room, and
 * changes floor through the HUD rather than by finding stairs — which is also
 * what keeps this usable on a phone, where there is no pointer lock at all.
 *
 * Shift runs. There is deliberately no jump: a jump is only meaningful with
 * gravity and collision, i.e. the physics engine this file exists to avoid.
 */
export function FirstPersonControls({
  floorLevel,
  enabled,
  onLockChange,
  touch = false,
  moveRef,
}: {
  floorLevel: number;
  enabled: boolean;
  onLockChange?: (locked: boolean) => void;
  /** Touch device: drag-look instead of pointer lock, joystick instead of WASD. */
  touch?: boolean;
  /** Joystick output, written by the HUD and read here each frame. */
  moveRef?: { current: { f: number; r: number } };
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

  // Drag-look for touch. PointerLockControls does nothing on a phone (there is
  // no pointer to lock), so without this a visitor can only ever face the way
  // they spawned — which is the whole "cannot look around on mobile" bug.
  useEffect(() => {
    if (!touch || !enabled) return;
    const canvas = get().gl.domElement;
    let drag: { x: number; y: number; id: number } | null = null;

    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const camera = get().camera;
      // YXZ so yaw and pitch stay independent; the default XYZ order rolls the
      // horizon as soon as you combine the two.
      camera.rotation.order = "YXZ";
      // ~0.005 rad/px: a full turn is roughly one screen-width swipe.
      camera.rotation.y -= (e.clientX - drag.x) * 0.005;
      camera.rotation.x = Math.max(
        -1.45,
        Math.min(1.45, camera.rotation.x - (e.clientY - drag.y) * 0.005)
      );
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };

    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [touch, enabled, get]);

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
    const running = held.has("ShiftLeft") || held.has("ShiftRight");
    const step = Math.min(delta, 0.1) * (running ? 7 : 4);

    // The joystick feeds the same two axes the keys produce, so touch and
    // keyboard share one movement integration rather than two that drift.
    const stick = moveRef?.current;
    const f =
      (held.has("KeyW") || held.has("ArrowUp") ? 1 : 0) -
      (held.has("KeyS") || held.has("ArrowDown") ? 1 : 0) +
      (stick?.f ?? 0);
    const r =
      (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0) -
      (held.has("KeyA") || held.has("ArrowLeft") ? 1 : 0) +
      (stick?.r ?? 0);
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
  // Pointer lock is a no-op on touch — mounting it there would swallow the
  // taps that pick artworks without ever locking anything.
  if (touch) return null;
  return (
    <PointerLockControls
      makeDefault
      onLock={() => onLockChange?.(true)}
      onUnlock={() => onLockChange?.(false)}
    />
  );
}
