"use client";

import { useState, type ReactNode } from "react";
import nextDynamic from "next/dynamic";

import type { ViewerArtwork } from "@/features/exhibitions/viewer3d/exhibition-3d-viewer";

// PERF-3.05: three/@react-three/fiber/@react-three/drei (the bulk of this
// feature's JS) are only fetched when the viewer actually mounts, not bundled
// into every exhibition page's initial JS — a visitor who only ever looks at
// the 2D list (or switches to it) never pays for the 3D engine at all. `ssr:
// false` because the whole component tree needs `window`/WebGL.
const Exhibition3DViewer = nextDynamic(
  () => import("@/features/exhibitions/viewer3d/exhibition-3d-viewer").then((m) => m.Exhibition3DViewer),
  {
    ssr: false,
    loading: () => (
      <div className="bg-band flex h-[520px] w-full items-center justify-center rounded-lg">
        <p className="text-ink-muted text-small">Loading 3D viewer…</p>
      </div>
    ),
  }
);

/**
 * FE-3.07/3.09: switches between the 3D viewer and the page's existing 2D
 * gallery grid (passed in as `gallery`, unchanged) — the 2D grid doubles as
 * the required non-WebGL fallback, so it is never re-implemented here.
 */
export function ExhibitionViewToggle({
  artworks,
  gallery,
}: {
  artworks: ViewerArtwork[];
  gallery: ReactNode;
}) {
  const [mode, setMode] = useState<"3d" | "list">("3d");

  return (
    <div className="mt-12">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("3d")}
          aria-pressed={mode === "3d"}
          className={`text-small rounded-full border px-3 py-1.5 ${
            mode === "3d"
              ? "border-ink bg-ink text-white"
              : "border-hairline-strong text-ink-muted hover:border-ink"
          }`}
        >
          3D view
        </button>
        <button
          type="button"
          onClick={() => setMode("list")}
          aria-pressed={mode === "list"}
          className={`text-small rounded-full border px-3 py-1.5 ${
            mode === "list"
              ? "border-ink bg-ink text-white"
              : "border-hairline-strong text-ink-muted hover:border-ink"
          }`}
        >
          Gallery list
        </button>
      </div>

      <div className="mt-6">
        {mode === "3d" ? (
          <Exhibition3DViewer artworks={artworks} />
        ) : (
          gallery
        )}
      </div>
    </div>
  );
}
