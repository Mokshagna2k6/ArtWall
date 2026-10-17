"use client";

import nextDynamic from "next/dynamic";

import type { VirtualBuilding } from "@/features/wallos/virtual-wall/actions";

/**
 * Client entry point for the 3D building.
 *
 * three/@react-three/fiber/@react-three/drei are the bulk of this feature's
 * JS and are only fetched when the viewer mounts (same reasoning as the
 * exhibition viewer's own lazy boundary, PERF-3.05). `ssr: false` because the
 * tree needs `window`/WebGL.
 *
 * This file exists so the *page* (a Server Component) never imports the R3F
 * tree directly: `next/dynamic` with `ssr: false` is only valid in a Client
 * Component, and a page that imported the viewer itself would pull three.js
 * into the server graph.
 */
const VirtualWallViewer = nextDynamic(
  () =>
    import("@/features/wallos/virtual-wall/virtual-wall-viewer").then(
      (m) => m.VirtualWallViewer
    ),
  {
    ssr: false,
    loading: () => (
      <div className="bg-band flex h-[70vh] min-h-[420px] w-full items-center justify-center rounded-lg">
        <p className="text-ink-muted text-small">Loading the building…</p>
      </div>
    ),
  }
);

export function VirtualWallClient({
  building,
  canPlace,
}: {
  building: VirtualBuilding;
  canPlace: boolean;
}) {
  return <VirtualWallViewer building={building} canPlace={canPlace} />;
}
