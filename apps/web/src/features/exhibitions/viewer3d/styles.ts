/**
 * Bible §15: the six styled galleries — White Cube, Loft, Haveli, Outdoor
 * Garden, Modern Glass and Custom.
 *
 * COMPOSE, NOT REPLACE. `templates.ts` holds six *room shapes* (single-wall,
 * rectangular-room, …), which are pure geometry: they answer "where does the
 * Nth artwork hang". A style answers a different question — "what do the wall,
 * floor and light look like". They are orthogonal axes, so a style is a second
 * field alongside the template rather than a replacement for it: every
 * existing shape keeps working unchanged, and any of the 6 shapes × 6 styles
 * combinations is valid. Folding style into `ExhibitionTemplate` would have
 * meant 36 entries and would have broken every existing `placeArtwork` caller.
 *
 * §15 performance: every style here is plain colours, materials and lights —
 * no GLTF download, no external texture fetch, nothing that grows the initial
 * scene. The whole registry is a few hundred bytes of JSON-ish data, so the
 * 10MB / 30fps-on-mid-range-Android budget is unaffected by the choice of
 * style. `lightCount` is deliberately small (≤3 dynamic lights per style) and
 * no style casts more than one shadow map.
 */

export type ExhibitionStyle =
  | "white-cube"
  | "loft"
  | "haveli"
  | "outdoor-garden"
  | "modern-glass"
  | "custom";

/** Thin-film look of a surface, kept to what `meshStandardMaterial` takes. */
export interface SurfaceSpec {
  color: string;
  roughness: number;
  metalness: number;
}

export interface LightSpec {
  /** Flat fill. Pre-baked feel without a lightmap texture. */
  ambientIntensity: number;
  /** Colour of the ambient + key light, i.e. the mood of the room. */
  ambientColor: string;
  /** Overhead key: track lighting, a window, or the sun. */
  keyColor: string;
  keyIntensity: number;
  keyPosition: [number, number, number];
  /** Optional second light; null keeps the style to a single dynamic light. */
  fillColor: string | null;
  fillIntensity: number;
}

export interface StyleSpec {
  id: ExhibitionStyle;
  label: string;
  /** One line for the picker, straight from the Bible's description. */
  description: string;
  wall: SurfaceSpec;
  floor: SurfaceSpec;
  lighting: LightSpec;
  /** Scene background colour, also the fog/sky the camera sees past the walls. */
  backdrop: string;
  /** True for the open-air styles, where the "ceiling" is sky, not plaster. */
  openAir: boolean;
  /** Bible marks Custom as Growth phase — the picker should say so. */
  growthPhase: boolean;
}

export const STYLES: StyleSpec[] = [
  {
    id: "white-cube",
    label: "White Cube",
    description:
      "Classic gallery: white walls, track lighting, wooden floor. Neutral, lets the art speak.",
    wall: { color: "#f7f6f4", roughness: 0.95, metalness: 0 },
    floor: { color: "#c9a97c", roughness: 0.7, metalness: 0 },
    lighting: {
      ambientIntensity: 0.65,
      ambientColor: "#ffffff",
      keyColor: "#fffaf0",
      keyIntensity: 45,
      keyPosition: [0, 4.2, 0],
      fillColor: null,
      fillIntensity: 0,
    },
    backdrop: "#ecebe8",
    openAir: false,
    growthPhase: false,
  },
  {
    id: "loft",
    label: "Loft",
    description:
      "Exposed brick, large windows, industrial lighting. Atmospheric; suits contemporary art.",
    wall: { color: "#8b5e4c", roughness: 0.9, metalness: 0.02 },
    floor: { color: "#6b6560", roughness: 0.85, metalness: 0.05 },
    lighting: {
      ambientIntensity: 0.4,
      ambientColor: "#d8d2c8",
      // Low and off to one side: the window wall, not an even ceiling wash.
      keyColor: "#fff3dd",
      keyIntensity: 55,
      keyPosition: [-6, 3.4, 2],
      fillColor: "#9fb3c8",
      fillIntensity: 18,
    },
    backdrop: "#2e2a27",
    openAir: false,
    growthPhase: false,
  },
  {
    id: "haveli",
    label: "Haveli",
    description:
      "Traditional Rajasthani: arched doorways, jali screens, warm lighting. For traditional Indian art forms.",
    wall: { color: "#e8c9a0", roughness: 0.92, metalness: 0 },
    floor: { color: "#9c4a3c", roughness: 0.55, metalness: 0.08 },
    lighting: {
      ambientIntensity: 0.5,
      ambientColor: "#f6dcae",
      keyColor: "#ffc87a",
      keyIntensity: 50,
      keyPosition: [0, 3.8, 0],
      // Second warm source reads as light through a jali screen.
      fillColor: "#e09a4a",
      fillIntensity: 22,
    },
    backdrop: "#c98f52",
    openAir: false,
    growthPhase: false,
  },
  {
    id: "outdoor-garden",
    label: "Outdoor Garden",
    description:
      "Walls standing in an open garden, natural light, plants. For nature, landscape and organic work.",
    wall: { color: "#ded9cf", roughness: 0.98, metalness: 0 },
    floor: { color: "#5f7a46", roughness: 1, metalness: 0 },
    lighting: {
      ambientIntensity: 0.85,
      ambientColor: "#eaf2ff",
      // Sun: high, off-axis, slightly warm.
      keyColor: "#fff6e0",
      keyIntensity: 40,
      keyPosition: [5, 7, 4],
      fillColor: "#bfe3a8",
      fillIntensity: 14,
    },
    backdrop: "#9fc9e8",
    openAir: true,
    growthPhase: false,
  },
  {
    id: "modern-glass",
    label: "Modern Glass",
    description:
      "Glass walls, city skyline backdrop, minimalist. For contemporary and digital art.",
    wall: { color: "#b8c6ce", roughness: 0.12, metalness: 0.55 },
    floor: { color: "#2b2f33", roughness: 0.25, metalness: 0.35 },
    lighting: {
      ambientIntensity: 0.55,
      ambientColor: "#cfe0ea",
      keyColor: "#ffffff",
      keyIntensity: 38,
      keyPosition: [0, 5, -3],
      fillColor: "#7fa8c9",
      fillIntensity: 20,
    },
    backdrop: "#4a6378",
    openAir: true,
    growthPhase: false,
  },
  {
    // Growth phase per the Bible: the slots exist and render, but there is no
    // editing UI yet — picking Custom today gives these defaults. When the
    // editor lands it writes wall/floor/lighting over this entry's values.
    id: "custom",
    label: "Custom (coming soon)",
    description:
      "Growth phase: the artist or curator picks wall colour, floor material and lighting. Defaults shown until the editor ships.",
    wall: { color: "#ded8d0", roughness: 0.9, metalness: 0 },
    floor: { color: "#a39488", roughness: 0.8, metalness: 0 },
    lighting: {
      ambientIntensity: 0.6,
      ambientColor: "#ffffff",
      keyColor: "#ffffff",
      keyIntensity: 42,
      keyPosition: [0, 4, 0],
      fillColor: null,
      fillIntensity: 0,
    },
    backdrop: "#dcd8d2",
    openAir: false,
    growthPhase: true,
  },
];

export const DEFAULT_STYLE: ExhibitionStyle = "white-cube";

export function getStyle(id: ExhibitionStyle): StyleSpec {
  // Non-null: STYLES covers every member of the union, enforced by a test.
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}
