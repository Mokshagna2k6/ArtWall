"use client";

import { Suspense, useState } from "react";
import { Html, useTexture } from "@react-three/drei";

import { fullSrc } from "@/lib/cloudinary-url";
import type { Placement } from "@/features/exhibitions/viewer3d/templates";

/** Isolated so `useTexture`'s suspense-throw only ever wraps the mesh that needs it. */
function TexturedMaterial({ url }: { url: string }) {
  const texture = useTexture(url);
  return <meshStandardMaterial map={texture} toneMapped={false} />;
}

/** One framed artwork, textured with its Cloudinary image. */
export function ArtworkFrame({
  imageUrl,
  title,
  placement,
  onSelect,
}: {
  imageUrl: string | null;
  title: string;
  placement: Placement;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <group position={placement.position} rotation={[0, placement.rotationY, 0]}>
      {/* Frame border */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[1.7, 1.3]} />
        <meshStandardMaterial color={hovered ? "#d4a574" : "#2a2a2a"} />
      </mesh>
      {/* Canvas */}
      <mesh
        onClick={onSelect}
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
        <Html position={[0, -0.75, 0]} center distanceFactor={8}>
          <span className="whitespace-nowrap rounded bg-black/80 px-2 py-1 text-xs text-white">
            {title}
          </span>
        </Html>
      )}
    </group>
  );
}
