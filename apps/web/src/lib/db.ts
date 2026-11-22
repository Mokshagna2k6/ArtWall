import "server-only";

import { pool } from "@artwall/db";

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set.");
    this.name = "DatabaseNotConfiguredError";
  }
}

/** What a `getSql()` call returns: a tagged template, plus `.query(text, params)`. */
type SqlTag = {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

let tag: SqlTag | null = null;

/**
 * The SQL client, created lazily.
 *
 * Backed by the shared `pg` Pool from `@artwall/db`. It used to be the Neon
 * HTTP driver (`@neondatabase/serverless`), which speaks Neon's own protocol
 * and **cannot talk to Supabase** — every one of the 61 call sites failed with
 * "Error connecting to database: fetch failed" after the migration.
 *
 * The returned shape is deliberately identical to what the Neon driver gave
 * back — a tagged template and a `.query(text, params)` method, both resolving
 * to a plain array of rows — so none of those 61 call sites had to change.
 *
 * Lazy rather than module-scope so that importing this file during a build,
 * where `DATABASE_URL` may legitimately be absent, does not throw and break
 * prerendering. The error surfaces at call time, where a route can handle it.
 *
 * Unlike the old HTTP driver, this one CAN hold a transaction — but keep using
 * `inTransaction` from features/physical-wall/actions/shared.ts for that, so
 * every multi-statement unit of work goes through one reviewed helper.
 *
 * `server-only` at the top of this file makes it a build error for any client
 * component to import it: the connection string can never leak into a browser
 * bundle by accident.
 */
export function getSql(): SqlTag {
  if (!process.env.DATABASE_URL) throw new DatabaseNotConfiguredError();

  if (!tag) {
    const run = async <T>(text: string, params: unknown[]): Promise<T[]> =>
      (await pool.query(text, params)).rows as T[];

    // `pg` takes $1,$2,…; a tagged template hands us the interpolated values
    // separately, so they stay parameters and are never concatenated into SQL.
    const fn = <T>(strings: TemplateStringsArray, ...values: unknown[]) =>
      run<T>(
        strings.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""), ""),
        values
      );

    (fn as SqlTag).query = <T>(text: string, params: unknown[] = []) => run<T>(text, params);
    tag = fn as SqlTag;
  }

  return tag;
}
