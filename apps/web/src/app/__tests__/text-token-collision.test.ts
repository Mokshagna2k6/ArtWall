import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A `--text-*` size token must not share its name with a `--color-*` token.
 *
 * Tailwind resolves `text-<name>` against BOTH the font-size scale and the
 * colour palette. When a name exists in both, the colour also applies — so
 * `text-card`, meant as the card-heading *size* (`--text-card`, 62 call
 * sites), silently set `color: var(--color-card)` as well. `--color-card` was
 * the white card *surface*, so every one of those headings rendered white on
 * white. It was invisible in the mobile menu and merely lucky elsewhere,
 * because most of those headings sit on a white card where the inherited ink
 * colour happened to be overridden to the same white.
 *
 * The fix was to expose the surface as `card-surface` instead. This test is
 * here so re-adding `--color-card` (or colliding any other pair) fails loudly
 * rather than turning text invisible again.
 */
describe("design tokens: no text-size / colour name collisions", () => {
  const css = readFileSync(
    join(__dirname, "..", "globals.css"),
    "utf8"
  ).replace(/\r\n/g, "\n");

  /** `--text-foo: ...`, ignoring the `--text-foo--line-height` modifiers. */
  const names = (prefix: string) =>
    new Set(
      [...css.matchAll(new RegExp(`^\\s*--${prefix}-([a-z0-9-]+)\\s*:`, "gm"))]
        .map((m) => m[1])
        .filter((n) => !n.includes("--"))
    );

  it("finds the token scales it is meant to compare", () => {
    expect(names("text").size).toBeGreaterThan(5);
    expect(names("color").size).toBeGreaterThan(5);
  });

  it("no --text-* name is also a --color-* name", () => {
    const textNames = names("text");
    const colorNames = names("color");
    const collisions = [...textNames].filter((n) => colorNames.has(n));
    expect(
      collisions,
      `These names are both a font-size and a colour, so \`text-<name>\` will ` +
        `silently set a colour as well as a size: ${collisions.join(", ")}. ` +
        `Rename the colour (e.g. \`card\` -> \`card-surface\`).`
    ).toEqual([]);
  });

  it("card-surface is exposed, and bare card is not", () => {
    // The specific regression: --color-card made text-card white-on-white.
    expect(css).toMatch(/--color-card-surface:/);
    expect(css).not.toMatch(/^\s*--color-card:/m);
  });
});
