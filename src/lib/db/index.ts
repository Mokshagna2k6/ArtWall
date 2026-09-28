import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
