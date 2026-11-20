import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Every .tsx under a directory, recursively. */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

/**
 * A `grid` whose only column track is declared at `lg:` has an *implicit*
 * track below that breakpoint, and an implicit track is `auto` — it sizes to
 * its content's min-content width, not to the viewport.
 *
 * On /physical-wall that made a wide child (the slot map, a bordered card)
 * stretch the track to 550px and then 351px on a 360px phone, scrolling the
 * whole page sideways. `min-w-0` on the children cannot fix it: the track
 * itself is what is too wide.
 *
 * Declaring `grid-cols-[minmax(0,1fr)]` (or `grid-cols-1`, or an sm:/md:
 * track) caps the track at the container width and lets children shrink.
 */
describe("responsive grid tracks", () => {
  const files = tsxFiles("src/app");

  const offenders: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/className="([^"]*\bgrid\b[^"]*)"/g)) {
      const cls = m[1];
      if (!/\blg:grid-cols-/.test(cls)) continue;
      // A track declared for small screens, in any form, is fine.
      if (/\b(grid-cols-1|grid-cols-\[minmax\(0,1fr\)\]|sm:grid-cols-|md:grid-cols-)/.test(cls)) continue;
      offenders.push(`${file}: ${cls.slice(0, 70)}`);
    }
  }

  it("every lg: grid declares a track for small screens too", () => {
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
