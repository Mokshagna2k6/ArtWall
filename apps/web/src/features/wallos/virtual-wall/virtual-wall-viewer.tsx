"use client";

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

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
          >
            <ambientLight intensity={0.65} />
            <FloorScene
              floor={floor}
              selectableEmptySlots={canPlace}
              onSelectSlot={(slotId, artworkId) => setSelected({ slotId, artworkId })}
            />
            {mode === "walk" ? (
              <FirstPersonControls
                floorLevel={floor.level}
                enabled
                onLockChange={setLocked}
              />
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

        {mode === "walk" && !locked && (
          <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]">
            Click the view to look around · W A S D or arrow keys to walk · Esc to release
          </p>
        )}
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
