import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_STYLE,
  getStyle,
  STYLES,
  type ExhibitionStyle,
} from "@/features/exhibitions/viewer3d/styles";
import {
  placeArtwork,
  TEMPLATES,
  type ExhibitionTemplate,
} from "@/features/exhibitions/viewer3d/templates";

/** Bible §15 — the six styled galleries. */
const BIBLE_STYLES: ExhibitionStyle[] = [
  "white-cube",
  "loft",
  "haveli",
  "outdoor-garden",
  "modern-glass",
  "custom",
];

/** Pre-existing room shapes; a style must never cost us one of these. */
const SHAPES: ExhibitionTemplate[] = [
  "single-wall",
  "rectangular-room",
  "circular-gallery",
  "l-shaped",
  "corridor",
  "atrium",
];

const HEX = /^#[0-9a-f]{6}$/i;

describe("viewer3d style registry (Bible §15)", () => {
  it("has every Bible style, exactly once, and nothing else", () => {
    expect(STYLES.map((s) => s.id).sort()).toEqual([...BIBLE_STYLES].sort());
  });

  it("gives every style the fields the Room renderer reads", () => {
    for (const spec of STYLES) {
      expect(spec.label, spec.id).toBeTruthy();
      expect(spec.description, spec.id).toBeTruthy();
      expect(spec.backdrop, spec.id).toMatch(HEX);
      expect(typeof spec.openAir, spec.id).toBe("boolean");

      for (const surface of [spec.wall, spec.floor]) {
        expect(surface.color, spec.id).toMatch(HEX);
        expect(surface.roughness, spec.id).toBeGreaterThanOrEqual(0);
        expect(surface.roughness, spec.id).toBeLessThanOrEqual(1);
        expect(surface.metalness, spec.id).toBeGreaterThanOrEqual(0);
        expect(surface.metalness, spec.id).toBeLessThanOrEqual(1);
      }

      const l = spec.lighting;
      expect(l.ambientColor, spec.id).toMatch(HEX);
      expect(l.keyColor, spec.id).toMatch(HEX);
      expect(l.ambientIntensity, spec.id).toBeGreaterThan(0);
      expect(l.keyIntensity, spec.id).toBeGreaterThan(0);
      expect(l.keyPosition, spec.id).toHaveLength(3);
      if (l.fillColor !== null) {
        expect(l.fillColor, spec.id).toMatch(HEX);
        expect(l.fillIntensity, spec.id).toBeGreaterThan(0);
      }
    }
  });

  it("marks only Custom as Growth phase", () => {
    expect(STYLES.filter((s) => s.growthPhase).map((s) => s.id)).toEqual(["custom"]);
  });

  it("resolves every style id, and defaults to a real one", () => {
    for (const id of BIBLE_STYLES) expect(getStyle(id).id).toBe(id);
    expect(STYLES.some((s) => s.id === DEFAULT_STYLE)).toBe(true);
    expect(getStyle(DEFAULT_STYLE).growthPhase).toBe(false);
  });

  it("keeps the six room shapes — style composes with shape, it does not replace it", () => {
    expect(TEMPLATES.map((t) => t.id).sort()).toEqual([...SHAPES].sort());
    for (const shape of SHAPES) {
      const p = placeArtwork(shape, 0, 3);
      expect(p.position, shape).toHaveLength(3);
      expect(Number.isFinite(p.rotationY), shape).toBe(true);
    }
  });

  it("ships no model or texture download — §15 keeps the scene under 10MB", () => {
    const src = readFileSync(
      resolve(__dirname, "../viewer3d/styles.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/\.(gltf|glb|hdr|exr|ktx2|png|jpe?g)\b/i);
    expect(src).not.toMatch(/https?:\/\//);
  });

  it("actually renders the style: Room consumes it and the viewer passes it", () => {
    // The bug that shipped here before: imported, computed, never placed in JSX.
    const room = readFileSync(resolve(__dirname, "../viewer3d/room.tsx"), "utf8");
    expect(room).toMatch(/spec\.wall\.color/);
    expect(room).toMatch(/spec\.floor\.color/);
    expect(room).toMatch(/spec\.lighting\.keyIntensity/);
    expect(room).toMatch(/attach="background"/);

    const viewer = readFileSync(
      resolve(__dirname, "../viewer3d/exhibition-3d-viewer.tsx"),
      "utf8"
    );
    expect(viewer).toMatch(/<Room style=\{style\}\s*\/>/);
    expect(viewer).toMatch(/STYLES\.map/);
  });

  it("every style hangs its artworks on something — open-air included", () => {
    // Regression: `{!spec.openAir && ...}` skipped the wall meshes entirely
    // for Outdoor Garden and Modern Glass, so frames floated in mid-air with
    // nothing behind them. The Bible says "walls standing in an open garden":
    // the wall is the point, only the enclosure goes away.
    const room = readFileSync(resolve(__dirname, "../viewer3d/room.tsx"), "utf8");
    expect(room).not.toMatch(/\{\s*!spec\.openAir\s*&&/);
    // openAir still has to change something, or the two styles are identical
    // to the enclosed ones: it keeps the back panel and drops the sides.
    expect(room).toMatch(/spec\.openAir\s*\?/);

    // Both open-air styles must still define a wall colour to render with.
    for (const id of ["outdoor-garden", "modern-glass"] as const) {
      const spec = getStyle(id);
      expect(spec.openAir, id).toBe(true);
      expect(spec.wall.color, id).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
