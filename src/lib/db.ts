import "server-only";

import { neon } from "@neondatabase/serverless";

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set.");
    this.name = "DatabaseNotConfiguredError";
  }
}

let client: ReturnType<typeof neon> | null = null;

/**
 * The Neon SQL client, created lazily.
 *
 * Lazy rather than module-scope so that importing this file during a build -
 * where `DATABASE_URL` may legitimately be absent - does not throw and break
 * prerendering. The error surfaces at call time, where a route can handle it.
 *
 * Neon's driver speaks HTTP, not TCP, so it works inside serverless and edge
 * runtimes where a traditional pooled `pg` connection cannot, and it needs no
 * connection lifecycle management on our side.
 *
 * `server-only` at the top of this file makes it a build error for any client
 * component to import it - the connection string can never leak into a browser
 * bundle by accident.
 */
export function getSql() {
  if (!process.env.DATABASE_URL) throw new DatabaseNotConfiguredError();
  client ??= neon(process.env.DATABASE_URL);
  return client;
}
