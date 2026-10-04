"use client";

import { useState, type ReactNode } from "react";

import { Exhibition3DViewer, type ViewerArtwork } from "@/features/exhibitions/viewer3d/exhibition-3d-viewer";

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
