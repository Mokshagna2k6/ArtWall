import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import pg from "pg";

/**
 * Direct database access for e2e setup/teardown only (never for assertions
 * the UI should be making). Reads DATABASE_URL from the environment, falling
 * back to .env for local runs.
 */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (existsSync(".env")) {
    const env = parseEnv(readFileSync(".env", "utf8")) as Record<string, string>;
    if (env.DATABASE_URL) return env.DATABASE_URL;
  }
  throw new Error("DATABASE_URL is required for e2e tests");
}

let pool: pg.Pool | null = null;

export async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 2 });
  return (await pool.query(text, params)).rows as T[];
}

export async function closeDb() {
  await pool?.end();
  pool = null;
}

/**
 * Hand an e2e user's slots back to the wall. Their rows stay: pw_audit_log and
 * pw_ledger are append-only (DB triggers) and RESTRICT-reference the user and
 * booking, so a hard delete is refused by design. Cancelling the bookings
 * releases the occupancy (pw_bookings_sync_occupancy) and the slot state, so
 * the next run finds the wall as it was. E2E users are e2e_*@artwall.test.
 */
export async function releaseE2eUser(email: string) {
  const [user] = await q<{ id: string }>(`select id from "user" where email = $1`, [email]);
  if (!user) return;
  const bookings = `select id from pw_bookings where artist_id = $1`;
  await q(
    `update pw_slots set state = 'available', version = version + 1, updated_at = now()
     where id in (select slot_id from pw_booking_slots where booking_id in (${bookings}))
       and state in ('reserved', 'booked')`,
    [user.id]
  );
  await q(
    `update pw_bookings set status = 'cancelled', cancelled_reason = 'e2e teardown',
       hold_expires_at = null, updated_at = now()
     where artist_id = $1 and status not in ('cancelled', 'refunded', 'expired')`,
    [user.id]
  );
  await q(`delete from session where "userId" = $1`, [user.id]);
}
