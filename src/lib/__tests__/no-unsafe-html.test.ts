import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

/**
 * FE-2.13: all user-generated text (titles, captions, bios, exhibition
 * descriptions) renders through React escaping only. This records that grep
 * check as a runnable test rather than a one-off terminal command, so a new
 * dangerouslySetInnerHTML that takes DB content doesn't slip in unnoticed.
 *
 * Every current call site is enumerated and reviewed here:
 *  - components/seo/json-ld.tsx: JSON.stringify output with "<" escaped to
 *    < (prevents </script> breakout) — not raw DB text, and not HTML.
 *  - features/physical-wall/components/qr-code.tsx: output of the `qrcode`
 *    library (an SVG string built from a URL token we minted) — not DB
 *    content, and the library emits only <svg>/<path>.
 *
 * A new match that isn't one of these two must be reviewed and added here
 * deliberately, not allowed to pass by accident.
 */
const ALLOWED = new Set([
  "src/components/seo/json-ld.tsx",
  "src/features/physical-wall/components/qr-code.tsx",
]);

function findFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) findFiles(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("dangerouslySetInnerHTML is only used at reviewed, non-DB-content sites", () => {
  const repoRoot = resolve(__dirname, "../../..");
  const root = resolve(repoRoot, "src");
  const needle = ["dangerouslySet", "InnerHTML"].join("");
  const hits: string[] = [];
  for (const file of findFiles(root)) {
    if (file.endsWith("no-unsafe-html.test.ts")) continue; // this file names the needle in prose
    const content = readFileSync(file, "utf8");
    if (content.includes(needle)) {
      hits.push(file.slice(repoRoot.length + 1).replace(/\\/g, "/"));
    }
  }
  expect(hits.sort()).toEqual([...ALLOWED].sort());
});
