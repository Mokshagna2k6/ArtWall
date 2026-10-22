import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The showcase data has two delete paths — `scripts/seed-showcase.mjs --purge`
 * and `purgeShowcaseData` in the admin UI. They must remove the same rows.
 *
 * These are text assertions rather than behavioural ones on purpose: the real
 * risk is someone adding a table to one path and forgetting the other, which
 * leaves orphans that only show up in production. A test that reads both files
 * catches that at the point the second path is forgotten.
 */

const ROOT = resolve(__dirname, "../../../..");
/**
 * The terminal purge is `seed-showcase.mjs --purge`, which runs its own
 * statements plus `VIRTUAL_WALL_PURGE_SQL` imported from seed-virtual-wall.mjs
 * (the showcase virtual building). Both files make up that one path, so both
 * are read here — otherwise adding a table to the virtual-wall purge would
 * look like a drift from the admin action.
 */
const script = [
  readFileSync(resolve(ROOT, "scripts/seed-showcase.mjs"), "utf8"),
  readFileSync(resolve(ROOT, "scripts/seed-virtual-wall.mjs"), "utf8"),
].join("\n");
const action = readFileSync(resolve(ROOT, "src/features/admin/showcase.ts"), "utf8");

/** Tables named in a `delete from <table>` in either file. */
function deletedTables(source: string): string[] {
  return [...source.matchAll(/delete\s+from\s+"?([a-z_]+)"?/gi)]
    .map((m) => m[1].toLowerCase())
    .filter((t, i, all) => all.indexOf(t) === i)
    .sort();
}

describe("showcase purge paths", () => {
  it("the script and the admin action delete from the same tables", () => {
    expect(deletedTables(action)).toEqual(deletedTables(script));
  });

  it("deletes the tables the seed writes to", () => {
    const tables = deletedTables(script);
    for (const table of [
      "artworks",
      "artist_profiles",
      "user",
      // The showcase virtual building — hierarchy plus what hangs on it.
      "virtual_wall_placements",
      "slots",
      "walls",
      "rooms_zones",
      "floors",
      "buildings",
    ]) {
      expect(tables).toContain(table);
    }
  });

  it("every delete is constrained by a showcase prefix", () => {
    // A `delete from x` with no prefix condition would remove real data. Each
    // statement must reference a prefix — either literally, or through a local
    // binding built from one (`like`/`handleLike` in the admin action), or via
    // the showcase email domain that scopes the "user" delete.
    //
    // The bindings are checked first: if `like` were ever reassigned to
    // something unprefixed, that assertion fails before this loop runs.
    expect(action).toMatch(/const like = `\$\{SHOWCASE_PREFIX\}%`/);
    expect(action).toMatch(/const handleLike = `\$\{SHOWCASE_HANDLE_PREFIX\}%`/);

    const guard =
      /show_|showcase-|showcase\.artwall\.test|SHOWCASE_PREFIX|SHOWCASE_HANDLE_PREFIX|SHOWCASE_EMAIL_DOMAIN|\$\{like\}|\$\{handleLike\}/;

    for (const source of [script, action]) {
      // Take everything up to the end of the statement, not up to the first
      // backtick: the "user" delete is a multi-line template whose condition
      // sits several lines below the table name.
      const statements = source
        .split(/delete\s+from/i)
        .slice(1)
        .map((s) => s.split(/`;|`,\s*$|;\s*$/m)[0]);

      for (const statement of statements) {
        expect(guard.test(statement), `unguarded delete: ${statement.trim()}`).toBe(
          true
        );
      }
    }
  });

  it("the admin action is gated on super_admin", () => {
    expect(action).toMatch(/requireAdminRole\(\s*"super_admin"\s*\)/);
  });

  it("the purge is audit-logged", () => {
    expect(action).toMatch(/recordAudit\(/);
    expect(action).toContain("showcase.purge");
  });

  it("the two files agree on the id prefix", () => {
    const from = (source: string, name: string) =>
      source.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`))?.[1];

    expect(from(action, "SHOWCASE_PREFIX")).toBe(from(script, "SHOWCASE_PREFIX"));
    expect(from(action, "SHOWCASE_HANDLE_PREFIX")).toBe(
      from(script, "SHOWCASE_HANDLE_PREFIX")
    );
  });
});
