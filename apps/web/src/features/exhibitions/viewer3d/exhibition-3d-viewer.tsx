"use client";

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import { ArtworkFrame } from "@/features/exhibitions/viewer3d/artwork-frame";
import { Room } from "@/features/exhibitions/viewer3d/room";
import {
  placeArtwork,
  TEMPLATES,
  type ExhibitionTemplate,
} from "@/features/exhibitions/viewer3d/templates";

export interface ViewerArtwork {
  id: string;
  title: string;
  imageUrl: string | null;
}

/** True once, cheaply: a throwaway canvas either gets a WebGL context or it doesn't. */
function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

/**
 * FE-3.07/3.08/3.09: the 3D exhibition viewer.
 *
 * Six selectable templates (FE-3.08) position the same artwork list
 * differently in space; `onFallback` lets the caller swap in its existing 2D
 * gallery grid when WebGL isn't available (FE-3.09) — this component never
 * renders that fallback itself, since the page already has one.
 */
export function Exhibition3DViewer({
  artworks,
  defaultTemplate = "rectangular-room",
  onSelectArtwork,
}: {
  artworks: ViewerArtwork[];
  defaultTemplate?: ExhibitionTemplate;
  onSelectArtwork?: (id: string) => void;
}) {
  const [template, setTemplate] = useState<ExhibitionTemplate>(defaultTemplate);
  const webglOk = useMemo(() => supportsWebGL(), []);

  const placements = useMemo(
    () => artworks.map((_, i) => placeArtwork(template, i, artworks.length)),
    [artworks, template]
  );

  if (!webglOk) {
    return (
      <p className="text-ink-muted rounded-md border border-dashed p-6 text-sm">
        Your browser doesn&rsquo;t support 3D viewing. Showing the gallery list
        below instead.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="3D exhibition template">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTemplate(t.id)}
            aria-pressed={template === t.id}
            className={`text-small rounded-full border px-3 py-1.5 ${
              template === t.id
                ? "border-ink bg-ink text-white"
                : "border-hairline-strong text-ink-muted hover:border-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-band h-[520px] w-full overflow-hidden rounded-lg">
        <Canvas camera={{ position: [0, 1.6, 9], fov: 55 }}>
          <Room />
          {artworks.map((artwork, i) => (
            <ArtworkFrame
              key={artwork.id}
              imageUrl={artwork.imageUrl}
              title={artwork.title}
              placement={placements[i]}
              onSelect={() => onSelectArtwork?.(artwork.id)}
            />
          ))}
          <OrbitControls
            enablePan={false}
            minDistance={2}
            maxDistance={20}
            maxPolarAngle={Math.PI / 2}
          />
        </Canvas>
      </div>
    </div>
  );
}
