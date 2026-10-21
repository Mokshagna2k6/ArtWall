import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * Sized for serverless (PERF-2.11). Every function instance gets its own pool,
 * so the database sees (instances x max) client connections. DATABASE_URL must
 * be Neon's `-pooler` endpoint (PgBouncer, transaction mode, thousands of client
 * connections) - never the direct one, whose ~100-connection cap a traffic
 * spike exhausts. Nothing here relies on session state (no session advisory
 * locks, LISTEN or named prepared statements), so transaction pooling is safe.
 *
 *  - max 5: one request rarely needs more than a couple at once; the rest of
 *    a burst queues briefly instead of fanning out connections.
 *  - connectionTimeoutMillis: fail a request after 10s rather than hang it
 *    until the platform kills the function.
 *  - idleTimeoutMillis 60s, not 10s: the database is in ap-southeast-1 and a
 *    fresh connection costs ~1.1s from India, so dropping idle connections
 *    after 10s meant every page load following a short pause paid that again
 *    (measured: 1.1s warm vs 1.7s after a 15s gap). Supabase's transaction
 *    pooler is what actually protects the database from connection sprawl —
 *    these are pooler sessions, not Postgres backends — so holding a few for
 *    a minute is cheap and the latency win is large.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX) || 5,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 60_000,
});
if (process.env.VERCEL && !process.env.DATABASE_URL?.includes("-pooler")) {
  console.warn("[db] DATABASE_URL is not a Neon -pooler endpoint; serverless traffic can exhaust connections.");
}
// Neon drops connections server-side (idle timeout, compute suspend). pg reports
// that as an 'error' event on the pool (idle client) or on the client itself
// (checked out, e.g. held by Better Auth or a transaction). An unlistened
// 'error' event becomes an uncaughtException. The in-flight query still rejects
// and the dead client is discarded, so logging is all that's needed here.
const logDropped = (error: Error) =>
  console.error("[db] connection dropped:", error.message);
pool.on("error", logDropped);
pool.on("connect", (client) => client.on("error", logDropped));
export const db = drizzle(pool, { schema });
