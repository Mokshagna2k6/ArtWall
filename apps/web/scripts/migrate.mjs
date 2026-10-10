/**
 * Apply SQL migrations in db/migrations, in filename order.
 *
 * Each file's statements + the ledger insert run inside a single transaction,
 * so a mid-file failure rolls back cleanly instead of leaving partial state.
 *
 * Usage:  node --env-file=.env scripts/migrate.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import pg from "pg";

const DIR = join(import.meta.dirname, "..", "..", "..", "db", "migrations");

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Run with:  node --env-file=.env scripts/migrate.mjs"
  );
  process.exit(1);
}

// Plain TCP (pg), so the same script migrates Neon and a CI Postgres container.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`
  create table if not exists _migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  )
`);

const applied = new Set(
  (await pool.query("select name from _migrations")).rows.map((row) => row.name)
);

const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
let count = 0;

for (const file of files) {
  if (applied.has(file)) {
    console.log(`· ${file} (already applied)`);
    continue;
  }

  // The whole file goes to the server as one simple-protocol query. Postgres
  // parses it itself, so dollar-quoted ($$) function/trigger bodies, semicolons
  // inside string literals and trailing comments all just work. Splitting on
  // ";" client-side (the old approach) broke every PL/pgSQL body.
  const body = await readFile(join(DIR, file), "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(body);
    await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
    await client.query("COMMIT");
    console.log(`✓ ${file}`);
    count += 1;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`✗ ${file}:`, error.message ?? error);
    process.exit(1);
  } finally {
    client.release();
  }
}

await pool.end();

console.log(
  count === 0 ? "Nothing to apply." : `Applied ${count} migration(s).`
);
