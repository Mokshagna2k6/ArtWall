"use client";

import { Suspense, useRef, useState } from "react";
import { Html, useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";

import { fullSrc } from "@/lib/cloudinary-url";
import type { Placement } from "@/features/exhibitions/viewer3d/templates";

/**
 * PERF-3.05 texture-compression note: KTX2/Draco apply to a pre-baked 3D
 * asset pipeline (compressed GPU textures baked into a glTF, compressed mesh
 * geometry) — neither applies here. There is no glTF/mesh asset at all: each
 * frame is a plain `planeGeometry` and the "texture" is this project's own
 * artwork photo, already served through `fullSrc` (Cloudinary `f_auto`
 * picks AVIF/WebP per browser, `q_auto` picks quality, capped to 800px) —
 * i.e. already compressed at delivery, same as every other image on the
 * site, via the one mechanism that already exists rather than adding a KTX2
 * transcoding step for an asset format this viewer doesn't have. Isolated so
 * `useTexture`'s suspense-throw only ever wraps the mesh that needs it.
 */
function TexturedMaterial({ url }: { url: string }) {
  const texture = useTexture(url);
  return <meshStandardMaterial map={texture} toneMapped={false} />;
}

/**
 * One framed artwork, textured with its Cloudinary image.
 *
 * Hovering shows the plaque a gallery would hang beside it: title, the artist
 * the caller resolved from a *published* profile, then medium/year. §A13: no
 * owner, no price, no price history, no wallet — the caller must not pass any.
 * Clicking selects it; the caller decides what that means (navigate, or open a
 * panel).
 */
export function ArtworkFrame({
  imageUrl,
  title,
  artistName,
  medium,
  year,
  placement,
  onSelect,
}: {
  imageUrl: string | null;
  title: string;
  /** Null unless the artist profile is published. */
  artistName?: string | null;
  medium?: string | null;
  year?: number | null;
  placement: Placement;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  // Orbiting the room ends its drag on whatever is under the cursor, which
  // would otherwise read as a click on that frame. Only a near-stationary
  // press counts.
  const pressedAt = useRef<[number, number] | null>(null);

  function onPointerDown(event: ThreeEvent<PointerEvent>) {
    pressedAt.current = [event.clientX, event.clientY];
  }

  function onClick(event: ThreeEvent<MouseEvent>) {
    const from = pressedAt.current;
    pressedAt.current = null;
    if (from && Math.hypot(event.clientX - from[0], event.clientY - from[1]) > 6) return;
    event.stopPropagation();
    onSelect();
  }

  return (
    <group position={placement.position} rotation={[0, placement.rotationY, 0]}>
      {/* Frame moulding: a real box with depth, so it catches the light and
          throws a shadow onto the wall behind it instead of reading as a
          coloured rectangle. */}
      <mesh position={[0, 0, -0.03]} castShadow>
        <boxGeometry args={[1.78, 1.38, 0.08]} />
        <meshStandardMaterial
          color={hovered ? "#d4a574" : "#2a2a2a"}
          roughness={0.45}
          metalness={0.25}
        />
      </mesh>
      {/* Mount board, recessed inside the moulding. */}
      <mesh position={[0, 0, 0.005]}>
        <planeGeometry args={[1.64, 1.24]} />
        <meshStandardMaterial color="#faf8f4" roughness={0.95} />
      </mesh>
      {/* Canvas */}
      <mesh
        position={[0, 0, 0.012]}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <planeGeometry args={[1.5, 1.1]} />
        {imageUrl ? (
          <Suspense fallback={<meshStandardMaterial color="#e5e5e5" />}>
            <TexturedMaterial url={fullSrc(imageUrl, 800)} />
          </Suspense>
        ) : (
          <meshStandardMaterial color="#e5e5e5" />
        )}
      </mesh>
      {hovered && (
        <Html position={[0, -0.78, 0.1]} center distanceFactor={8} zIndexRange={[20, 0]}>
          <div className="pointer-events-none max-w-[16rem] rounded bg-black/85 px-2.5 py-1.5 text-center text-white">
            <p className="text-xs font-medium">{title}</p>
            {artistName && <p className="mt-0.5 text-[11px] opacity-90">{artistName}</p>}
            {(medium || year) && (
              <p className="mt-0.5 text-[10px] opacity-70">
                {[medium, year].filter(Boolean).join(" · ")}
              </p>
            )}
            <p className="mt-1 text-[10px] tracking-wide uppercase opacity-60">
              Click to view
            </p>
          </div>
        </Html>
      )}
    </group>
  );
}
