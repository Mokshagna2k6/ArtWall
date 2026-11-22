import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

/**
 * The root layout sets a canonical of "/", and Next INHERITS that into any
 * page whose metadata does not set its own. A public page that forgets
 * therefore tells Google it is a duplicate of the homepage, and drops out of
 * the index — which is exactly what had happened to all 452 /artwork/[id]
 * pages, the main artist SEO surface.
 *
 * Source scan rather than a render test: the bug is a missing declaration, and
 * a missing declaration is visible in the file. This also catches a NEW public
 * page that forgets, which a per-page render test never would.
 */
const APP = join(import.meta.dirname, "..");

/** Public, indexable routes. A new one belongs here when it is added. */
const INDEXABLE = [
  "artwork/[id]/page.tsx",
  "artist/[handle]/page.tsx",
  "exhibitions/[id]/page.tsx",
  "exhibitions/page.tsx",
  "verify/[hash]/page.tsx",
  "discover/page.tsx",
  "artists/page.tsx",
  "collections/[slug]/page.tsx",
  "walls/page.tsx",
];

/**
 * Comments are stripped before matching: the explanations in these files quote
 * the bad value on purpose, and matching prose would fail on documentation
 * rather than on code.
 */
function code(relative: string): string {
  return readFileSync(join(APP, relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

test.each(INDEXABLE)("%s declares its own canonical URL", (relative) => {
  expect(code(relative)).toMatch(/alternates:\s*\{[^}]*canonical/s);
});

test.each(INDEXABLE)("%s canonical is its own path, not the site root", (relative) => {
  expect(code(relative)).not.toMatch(/canonical:\s*["'`]\/["'`]/);
});
