/**
 * DB-2.13: every migration applies to an EMPTY database, and every migration
 * can be applied a SECOND time without error and without changing the schema.
 *
 * Creates a throwaway database on the server DATABASE_URL points at, applies
 * packages/db/migrations/*.sql in order, each file in its own transaction (exactly as
 * scripts/migrate.mjs does), fingerprints the catalog, applies every file
 * again, fingerprints again, compares, and drops the database.
 *
 *   node --env-file=.env scripts/migrations-check.mjs
 *   node scripts/migrations-check.mjs            (CI: DATABASE_URL = a disposable Postgres)
 *   ... --keep   keep the database and print its URL (e.g. to run pnpm test:db against it)
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const keep = process.argv.includes("--keep");
const name = `artwall_migcheck_${Date.now().toString(36)}`;
const target = new URL(url);
target.pathname = `/${name}`;

const dir = join(import.meta.dirname, "..", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

// Everything a re-run could plausibly change: columns, constraints, indexes, triggers, grants.
const FINGERPRINT = `
  select string_agg(x, E'\\n' order by x) from (
    select format('col %s.%s %s %s %s', table_name, column_name, data_type, is_nullable, column_default)
      from information_schema.columns where table_schema = 'public'
    union all
    select format('con %s %s %s', conrelid::regclass, conname, pg_get_constraintdef(oid))
      from pg_constraint where connamespace = 'public'::regnamespace
    union all
    select format('idx %s', indexdef) from pg_indexes where schemaname = 'public'
    union all
    select format('trg %s', pg_get_triggerdef(oid)) from pg_trigger
      where not tgisinternal and tgrelid::regclass::text not like 'pg_%'
    union all
    select format('acl %s %s', relname, relacl) from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r'
  ) t(x)`;

const admin = new pg.Client({ connectionString: url });
await admin.connect();
await admin.query(`create database ${name}`);
const client = new pg.Client({ connectionString: target.toString() });
let ok = true;

try {
  await client.connect();
  const prints = [];
  for (const pass of [1, 2]) {
    for (const file of files) {
      const body = await readFile(join(dir, file), "utf8");
      try {
        await client.query("begin");
        await client.query(body);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw new Error(`pass ${pass}, ${file}: ${error.message}`);
      }
    }
    prints.push((await client.query(FINGERPRINT)).rows[0].string_agg);
    console.log(`✓ pass ${pass}: ${files.length} migrations applied`);
  }
  if (prints[0] !== prints[1]) {
    const [a, b] = prints.map((p) => new Set(p.split("\n")));
    for (const line of a) if (!b.has(line)) console.error(`  - ${line}`);
    for (const line of b) if (!a.has(line)) console.error(`  + ${line}`);
    throw new Error("re-running the migrations changed the schema (diff above)");
  }
  console.log("✓ schema identical after the second pass");
} catch (error) {
  ok = false;
  console.error(`✗ ${error.message}`);
} finally {
  await client.end().catch(() => {});
  if (keep) console.log(`kept database: ${target}`);
  else await admin.query(`drop database if exists ${name} with (force)`);
  await admin.end();
}
process.exit(ok ? 0 : 1);
