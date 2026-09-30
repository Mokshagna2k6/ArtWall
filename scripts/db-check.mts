/**
 * Schema drift check against the live database.
 *
 *   1. Drizzle (src/lib/db/schema.ts) vs information_schema: every table and
 *      column Drizzle declares must exist with the same type, nullability and
 *      default-presence.
 *   2. Raw SQL in src/ and scripts/: every sql`...` / .query(`...`) statement is PREPAREd
 *      (parsed + analysed, never executed), which fails on any table or column
 *      that does not exist.
 *
 * Usage:  pnpm db:check      (exit 1 on any mismatch)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import pg from "pg";

import * as schema from "../src/lib/db/schema.ts";

process.removeAllListeners("warning");
const ROOT = join(import.meta.dirname, "..");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const problems: string[] = [];
const warnings: string[] = [];

/* ── 1. Drizzle vs database ─────────────────────────────────────────────── */

const { rows: dbCols } = await client.query<{
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  is_identity: "YES" | "NO";
  is_generated: "ALWAYS" | "NEVER";
}>(`select table_name, column_name, data_type, udt_name, is_nullable,
          column_default, is_identity, is_generated
   from information_schema.columns where table_schema = 'public'`);

const dbType = (c: (typeof dbCols)[number]) =>
  c.data_type === "ARRAY"
    ? `${c.udt_name.slice(1)}[]`.replace(/^int4/, "integer")
    : c.data_type.replace(" without time zone", "");

const byTable = new Map<string, Map<string, (typeof dbCols)[number]>>();
for (const c of dbCols) {
  if (!byTable.has(c.table_name)) byTable.set(c.table_name, new Map());
  byTable.get(c.table_name)!.set(c.column_name, c);
}

const drizzleTables = new Set<string>();
for (const value of Object.values(schema)) {
  if (!is(value, PgTable)) continue;
  const cfg = getTableConfig(value);
  drizzleTables.add(cfg.name);
  const actual = byTable.get(cfg.name);
  if (!actual) {
    problems.push(`table ${cfg.name}: in Drizzle, missing in DB`);
    continue;
  }
  const declared = new Set<string>();
  for (const col of cfg.columns) {
    declared.add(col.name);
    const where = `${cfg.name}.${col.name}`;
    const db = actual.get(col.name);
    if (!db) {
      problems.push(`${where}: in Drizzle, missing in DB`);
      continue;
    }
    const want = col.getSQLType().replace(" without time zone", "");
    if (want !== dbType(db)) problems.push(`${where}: Drizzle ${want}, DB ${dbType(db)}`);
    const dbNotNull = db.is_nullable === "NO";
    if (col.notNull !== dbNotNull)
      problems.push(`${where}: Drizzle ${col.notNull ? "not null" : "nullable"}, DB ${dbNotNull ? "not null" : "nullable"}`);
    const dbDefault = db.column_default !== null || db.is_identity === "YES" || db.is_generated === "ALWAYS";
    const drizzleDefault = col.hasDefault || col.generated !== undefined || col.generatedIdentity !== undefined;
    if (drizzleDefault !== dbDefault)
      problems.push(`${where}: Drizzle ${drizzleDefault ? "has" : "no"} default, DB ${dbDefault ? `default ${db.column_default ?? "(identity/generated)"}` : "none"}`);
  }
  for (const [name, c] of actual)
    if (!declared.has(name))
      // Generated columns are DB-owned; leaving them out of Drizzle is a choice.
      (c.is_generated === "ALWAYS" ? warnings : problems).push(
        `${cfg.name}.${name}: in DB, missing from Drizzle${c.is_generated === "ALWAYS" ? " (generated)" : ""}`
      );
}
for (const t of byTable.keys())
  if (!drizzleTables.has(t)) warnings.push(`table ${t}: in DB, not modelled in Drizzle (raw SQL only)`);

/* ── 2. Raw SQL statements ──────────────────────────────────────────────── */

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx|mjs|mts)$/.test(name) && !/\.test\./.test(name)) yield p;
  }
}

/** Read a template literal starting after its opening backtick. */
function readTemplate(src: string, i: number) {
  const parts: string[] = [];
  const exprs: string[] = [];
  let buf = "";
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") { buf += src.slice(i, i + 2); i += 2; continue; }
    if (ch === "`") { parts.push(buf); return { parts, exprs, end: i + 1 }; }
    if (ch === "$" && src[i + 1] === "{") {
      parts.push(buf); buf = "";
      let depth = 1, j = i + 2;
      while (depth > 0 && j < src.length) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") depth--;
        else if (src[j] === "`") j = readTemplate(src, j + 1).end - 1;
        j++;
      }
      exprs.push(src.slice(i + 2, j - 1));
      i = j;
      continue;
    }
    buf += ch; i++;
  }
  return { parts, exprs, end: i };
}

const STATEMENT = /^\s*(select|insert|update|delete|with)\b/i;
let checked = 0;
await client.query("begin");
for (const file of [...files(join(ROOT, "src")), ...files(join(ROOT, "scripts"))]) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  // Tagged: sql`...` (neon getSql: ${x} is a bound parameter).
  // Plain:  .query(`...`) (pg / neon .query: $n already in the text).
  for (const m of src.matchAll(/\bsql`|\.query(?:<[^>]*>)?\(\s*`/g)) {
    const tagged = m[0].startsWith("sql");
    const { parts, exprs } = readTemplate(src, m.index! + m[0].length);
    const line = src.slice(0, m.index).split("\n").length;
    let text: string;
    if (tagged) {
      // Drizzle's sql`` builds fragments; only whole statements can be prepared.
      // A nested sql`` fragment (optional where-clause) is checked as absent.
      let n = 0;
      text = parts.reduce(
        (acc, p, k) =>
          acc + p + (k < exprs.length ? (exprs[k].includes("sql`") ? "" : `$${++n}`) : ""),
        ""
      );
    } else {
      // Inline module-level string constants (const COLS = `...`); anything
      // else interpolated is dynamic and can only be reviewed by hand.
      const consts = exprs.map(
        (e) =>
          /^\w+$/.test(e.trim())
            ? src.match(new RegExp(`const ${e.trim()}\\s*=\\s*\`([^\`$]*)\``))?.[1]
            : undefined
      );
      if (consts.some((c) => c === undefined)) {
        warnings.push(`${rel}:${line}: .query() with dynamic interpolation, not checked`);
        continue;
      }
      text = parts.reduce((acc, p, k) => acc + p + (consts[k] ?? ""), "");
    }
    if (!STATEMENT.test(text)) continue;
    checked++;
    // PREPARE parses and analyses but never executes.
    await client.query("savepoint s");
    try {
      await client.query(
        `prepare _db_check as ${text.trim().replace(/;$/, "")}; deallocate _db_check; release savepoint s`
      );
    } catch (e) {
      await client.query("rollback to savepoint s");
      const msg = (e as Error).message;
      // Untyped placeholders are a limit of checking out of context, not drift.
      if (/could not determine data type of parameter|inconsistent types deduced/.test(msg))
        warnings.push(`${rel}:${line}: ${msg}`);
      else problems.push(`${rel}:${line}: ${msg}`);
    }
  }
}

await client.query("rollback");
await client.end();
for (const w of warnings) console.log(`warn  ${w}`);
for (const p of problems) console.log(`FAIL  ${p}`);
console.log(`\n${drizzleTables.size} Drizzle tables, ${checked} raw SQL statements checked: ${problems.length} problem(s), ${warnings.length} warning(s).`);
process.exit(problems.length ? 1 : 0);
