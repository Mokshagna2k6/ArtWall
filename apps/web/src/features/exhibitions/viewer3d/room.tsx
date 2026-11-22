"use client";

import {
  DEFAULT_STYLE,
  getStyle,
  type ExhibitionStyle,
} from "@/features/exhibitions/viewer3d/styles";

/**
 * Shared room shell — floor, backdrop and lighting for every template.
 *
 * The *shape* of the room comes from `templates.ts` (where artworks hang); the
 * *look* comes from `styles.ts` (Bible §15). They compose: any style renders
 * under any template. Everything here is colours, materials and at most three
 * lights — no model or texture download, per the §15 performance budget.
 */
export function Room({ style = DEFAULT_STYLE }: { style?: ExhibitionStyle }) {
  const spec = getStyle(style);

  return (
    <>
      <color attach="background" args={[spec.backdrop]} />
      <ambientLight
        intensity={spec.lighting.ambientIntensity}
        color={spec.lighting.ambientColor}
      />
      <pointLight
        position={spec.lighting.keyPosition}
        color={spec.lighting.keyColor}
        intensity={spec.lighting.keyIntensity}
        decay={2}
      />
      {spec.lighting.fillColor && (
        <pointLight
          position={[-spec.lighting.keyPosition[0], 2.2, -spec.lighting.keyPosition[2]]}
          color={spec.lighting.fillColor}
          intensity={spec.lighting.fillIntensity}
          decay={2}
        />
      )}

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial
          color={spec.floor.color}
          roughness={spec.floor.roughness}
          metalness={spec.floor.metalness}
        />
      </mesh>

      {/* Back and side walls the artworks hang against. Free-standing panels,
          not a sealed box: the templates place frames on an outward-facing
          ring too, and the camera orbits outside.

          Open-air styles (Outdoor Garden, Modern Glass) still get these
          panels — the Bible asks for "walls standing in an open garden", so
          the wall is the point and only the *enclosure* goes away. An earlier
          version skipped the meshes entirely for openAir, which left every
          frame floating in mid-air with nothing behind it. What openAir
          changes is the side panels: open-air keeps the back panel alone, so
          the space reads as outdoors rather than a three-sided room. */}
      {(spec.openAir
        ? [{ position: [0, 3, -12] as [number, number, number], rotationY: 0 }]
        : [
            { position: [0, 3, -12] as [number, number, number], rotationY: 0 },
            { position: [-12, 3, 0] as [number, number, number], rotationY: Math.PI / 2 },
            { position: [12, 3, 0] as [number, number, number], rotationY: -Math.PI / 2 },
          ]
      ).map((wall, i) => (
        <mesh key={i} position={wall.position} rotation={[0, wall.rotationY, 0]} receiveShadow>
          <planeGeometry args={[24, 6]} />
          <meshStandardMaterial
            color={spec.wall.color}
            roughness={spec.wall.roughness}
            metalness={spec.wall.metalness}
          />
        </mesh>
      ))}
    </>
  );
}
