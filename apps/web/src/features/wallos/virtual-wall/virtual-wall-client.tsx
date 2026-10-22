"use client";

import nextDynamic from "next/dynamic";

import type { VirtualBuilding } from "@/features/wallos/virtual-wall/actions";
import { TunnelLoaderFallback } from "@/features/wallos/virtual-wall/tunnel-loader";

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
    // The entry sequence covers this chunk fetch too — it is the slowest part
    // on a phone, and it is the one phase `useProgress` cannot see.
    loading: () => <TunnelLoaderFallback />,
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
