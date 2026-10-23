"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { AdaptiveDpr, OrbitControls, Sky, useProgress } from "@react-three/drei";

import { TunnelLoader } from "@/features/wallos/virtual-wall/tunnel-loader";

import { FloorScene } from "@/features/wallos/virtual-wall/building-scene";
import { FirstPersonControls } from "@/features/wallos/virtual-wall/first-person-controls";
import { EYE_HEIGHT, FLOOR_HEIGHT } from "@/features/wallos/virtual-wall/layout";
import type { VirtualBuilding } from "@/features/wallos/virtual-wall/actions";
import { VirtualWallFallback } from "@/features/wallos/virtual-wall/virtual-wall-fallback";
import { SlotPanel } from "@/features/wallos/virtual-wall/slot-panel";

/** True once, cheaply: a throwaway canvas either gets a WebGL context or it doesn't. */
function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export interface SelectedSlot {
  slotId: string;
  artworkId: string | null;
}

/**
 * The navigable 3D building.
 *
 * Navigation is WASD + pointer-lock mouselook (Bible §15); the reference
 * site's own scheme could not be determined, see
 * docs/product/VIRTUAL-WALL-RESEARCH.md. Pointer lock does not exist on touch, and
 * some devices cannot render 3D at all, so there are two other paths:
 * "Look around" (orbit, no lock — the existing viewer's control) and the 2D
 * list, which is also what a non-WebGL device gets automatically (§15's
 * required 2D scrollable fallback / FE-3.09).
 *
 * Only one floor is mounted at a time. The floors are stacked in real world Y
 * (so "up a floor" is a real height change, not a scene swap) but drawing all
 * of them at once would put every artwork texture on the GPU for a building
 * the visitor sees one level of — which is what the Bible's 30fps-on-mid-range
 * -Android target rules out.
 */
export function VirtualWallViewer({
  building,
  canPlace,
}: {
  building: VirtualBuilding;
  /** Server-resolved: is the viewer Super Admin? UI only — every write re-checks. */
  canPlace: boolean;
}) {
  const [floorIndex, setFloorIndex] = useState(0);
  const [mode, setMode] = useState<"walk" | "look" | "list">("walk");
  const [locked, setLocked] = useState(false);
  const [selected, setSelected] = useState<SelectedSlot | null>(null);
  const webglOk = useMemo(() => supportsWebGL(), []);
  const { entering, percent, skip } = useEntrySequence();

  const floor = building.floors[floorIndex];

  if (!webglOk || mode === "list" || !floor) {
    return (
      <div className="flex flex-col gap-3">
        <ViewModes mode={webglOk ? mode : "list"} setMode={setMode} webglOk={webglOk} />
        <VirtualWallFallback building={building} canPlace={canPlace} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ViewModes mode={mode} setMode={setMode} webglOk={webglOk} />

      <div className="relative">
        <div className="bg-band h-[70vh] min-h-[420px] w-full overflow-hidden rounded-lg">
          <Canvas
            camera={{
              position: [0, floor.level * FLOOR_HEIGHT + EYE_HEIGHT, 0],
              fov: 70,
            }}
            // Cap the pixel ratio: a 3x phone screen renders 9x the pixels for
            // no visible gain and misses the 30fps target (Bible §15).
            dpr={[1, 1.75]}
            // Soft shadows from the one directional key light in FloorScene.
            // PCFSoft at a 1024 map is the quality/cost point that still hits
            // the 30fps mid-range-Android target (Bible §15).
            shadows="soft"
          >
            {/* Procedural atmosphere, visible through the ceiling skylight.
                Deliberately `Sky` and not `Environment preset=…`: a preset
                downloads an HDR from a third-party CDN, which is a network
                dependency this page does not need and cannot control. */}
            <Sky sunPosition={[6, 18, 4]} turbidity={6} rayleigh={1.2} />
            {/* Drops the resolution if the device cannot keep up, rather than
                dropping frames. */}
            <AdaptiveDpr pixelated />
            <ambientLight intensity={0.35} />
            <FloorScene
              floor={floor}
              selectableEmptySlots={canPlace}
              onSelectSlot={(slotId, artworkId) => setSelected({ slotId, artworkId })}
            />
            {mode === "walk" ? (
              <>
                <FirstPersonControls
                  floorLevel={floor.level}
                  enabled
                  onLockChange={setLocked}
                />
                <CrosshairPicker
                  active={locked}
                  onPick={(slotId, artworkId) => setSelected({ slotId, artworkId })}
                />
              </>
            ) : (
              <OrbitControls
                enablePan={false}
                target={[0, floor.level * FLOOR_HEIGHT + EYE_HEIGHT, -1]}
                minDistance={1}
                maxDistance={14}
                maxPolarAngle={Math.PI / 2}
              />
            )}
          </Canvas>
        </div>

        {/* The entry sequence sits over the live canvas rather than replacing
            it: the scene must be mounted for its textures to start loading at
            all, which is exactly what this is waiting on. */}
        {entering && (
          <TunnelLoader percent={percent} onSkip={skip} label="Entering the gallery" />
        )}

        {/* HUD. Mirrors the one overlay pattern actually observed on the
            reference: a title plus a details affordance, nothing else. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
          <div className="pointer-events-auto rounded-md bg-black/70 px-3 py-2 text-white">
            <p className="text-sm font-medium">{building.name}</p>
            <p className="text-xs opacity-80">
              {floor.name} · {floor.walls.length} wall
              {floor.walls.length === 1 ? "" : "s"}
            </p>
          </div>

          <nav
            className="pointer-events-auto flex flex-col gap-1 rounded-md bg-black/70 p-2"
            aria-label="Floors"
          >
            {building.floors.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFloorIndex(i)}
                aria-current={i === floorIndex}
                className={`rounded px-2 py-1 text-xs ${
                  i === floorIndex ? "bg-white text-black" : "text-white hover:bg-white/20"
                }`}
              >
                {f.name}
              </button>
            ))}
          </nav>
        </div>

        {mode === "walk" && <ControlsLegend locked={locked} />}
      </div>

      {selected && (
        <SlotPanel
          slot={selected}
          building={building}
          canPlace={canPlace}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/** Hard ceiling on the entry sequence, ms. A stalled CDN must not trap anyone. */
const ENTRY_TIMEOUT_MS = 12_000;

/**
 * Drives the entry sequence off drei's real asset progress.
 *
 * `useProgress` reports the textures three.js is actually fetching, so this is
 * not a timer pretending to be a loader. Two things it cannot do on its own,
 * handled here:
 *
 * - `active` is also false *before* the first texture has been requested, so
 *   dismissing on `!active` alone would flash the overlay away on frame one.
 *   The sequence only ends once loading has started and then finished.
 * - a texture that never resolves would hold the overlay forever, so there is
 *   both a hard timeout and a visible "Enter now".
 */
function useEntrySequence() {
  const { active, progress, errors, total } = useProgress();
  const [entering, setEntering] = useState(true);
  // Derived, not an effect-set flag: `total` is the store's own count of
  // requested items, so it is non-zero exactly once loading has begun and
  // stays non-zero afterwards.
  const started = total > 0;

  useEffect(() => {
    if (!entering) return;
    // Done, or giving up on a failed asset: either way the gallery is usable,
    // a missing texture only costs that one picture.
    if ((started && !active) || errors.length > 0) {
      const id = setTimeout(() => setEntering(false), 350);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setEntering(false), ENTRY_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [entering, started, active, errors.length]);

  return {
    entering,
    // Before loading has begun there is no real number to show, so the bar
    // holds at a small value rather than jumping to 100 and back to 0.
    percent: started ? progress : 5,
    skip: () => setEntering(false),
  };
}

/**
 * The standing on-screen control legend.
 *
 * Floors are a HUD control, not stairs (see first-person-controls' header), so
 * the legend says so rather than leaving a visitor hunting for a staircase.
 * It stays visible while walking; the "click to look around" prompt is the one
 * line that disappears once the pointer is actually locked.
 */
/**
 * Click what the crosshair is on, while the pointer is locked.
 *
 * Under pointer lock the mouse has no position, so r3f keeps raycasting from
 * the last coordinates it saw before locking — which means clicking a frame
 * while walking either misses or hits whatever happened to be under the cursor
 * when you locked. This raycasts from the centre of the screen instead, which
 * is where the crosshair is and where the visitor is actually looking.
 *
 * Only mounted while locked, so the normal pointer-driven picking in
 * "Look around" mode is untouched.
 */
function CrosshairPicker({
  active,
  onPick,
}: {
  active: boolean;
  onPick: (slotId: string, artworkId: string | null) => void;
}) {
  // `raycaster` comes from the r3f store rather than `new Raycaster()`: this
  // app has no direct `three` import anywhere and @types/three is only a
  // transitive dependency, so importing it would mean adding one.
  const { camera, scene, gl, raycaster, pointer } = useThree();

  useEffect(() => {
    if (!active) return;
    function onClick() {
      // Screen centre in normalised device coordinates, where the crosshair is.
      const centre = pointer.clone().set(0, 0);
      raycaster.setFromCamera(centre, camera);
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        // Walk up to the slot group: the hit is a frame or plate mesh, and the
        // slotId lives on the group wrapping it (building-scene.tsx).
        for (let node = hit.object as { userData?: Record<string, unknown>; parent?: unknown } | null | undefined; node; node = node.parent as typeof node) {
          const slotId = node.userData?.slotId;
          if (typeof slotId === "string") {
            onPick(slotId, (node.userData?.artworkId as string | null) ?? null);
            return;
          }
        }
      }
    }

    const canvas = gl.domElement;
    canvas.addEventListener("click", onClick);
    return () => canvas.removeEventListener("click", onClick);
  }, [active, camera, scene, gl, raycaster, pointer, onPick]);

  return null;
}

function ControlsLegend({ locked }: { locked: boolean }) {
  const rows: [string, string][] = [
    ["Walk", "W A S D"],
    ["Run", "SHIFT"],
    ["Look", "MOUSE"],
    ["Change floor", "BUTTONS, TOP RIGHT"],
    ["Release cursor", "ESC"],
  ];
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3">
      {!locked && (
        <p className="rounded bg-black/70 px-3 py-1.5 text-xs text-white">
          Click the view to look around
        </p>
      )}
      <dl className="flex flex-wrap justify-center gap-x-4 gap-y-1 rounded-md bg-black/60 px-3 py-2 text-white">
        {rows.map(([action, key]) => (
          <div key={action} className="flex items-center gap-1.5">
            <dt className="text-[11px] opacity-75">{action}</dt>
            <dd className="rounded border border-white/30 px-1.5 text-[11px] font-medium tracking-wide">
              {key}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ViewModes({
  mode,
  setMode,
  webglOk,
}: {
  mode: "walk" | "look" | "list";
  setMode: (m: "walk" | "look" | "list") => void;
  webglOk: boolean;
}) {
  const options: { id: "walk" | "look" | "list"; label: string }[] = [
    { id: "walk", label: "Walk through" },
    { id: "look", label: "Look around" },
    { id: "list", label: "List view" },
  ];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="How to view the building">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={!webglOk && o.id !== "list"}
          onClick={() => setMode(o.id)}
          aria-pressed={mode === o.id}
          className={`text-small rounded-full border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 ${
            mode === o.id
              ? "border-ink bg-ink text-white"
              : "border-hairline-strong text-ink-muted hover:border-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
      {!webglOk && (
        <span className="text-ink-muted self-center text-xs">
          This device can&rsquo;t render 3D — showing the list.
        </span>
      )}
    </div>
  );
}
