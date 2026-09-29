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
 * Remove everything an e2e user created and hand their slots back to the
 * wall, so the shared test database is left as it was found.
 */
export async function purgeE2eUser(email: string) {
  const [user] = await q<{ id: string }>(`select id from "user" where email = $1`, [email]);
  if (!user) return;
  const bookings = `select id from pw_bookings where artist_id = $1`;
  await q(
    `update pw_slots set state = 'available', version = version + 1, updated_at = now()
     where id in (select slot_id from pw_booking_slots where booking_id in (${bookings}))
       and state in ('reserved', 'booked')`,
    [user.id]
  );
  for (const table of [
    "pw_invoices",
    "pw_ledger",
    "pw_refunds",
    "pw_payments",
    "pw_install_windows",
    "pw_booking_slots",
    "pw_agreements",
  ]) {
    await q(`delete from ${table} where booking_id in (${bookings})`, [user.id]);
  }
  await q(`delete from pw_audit_log where actor_id = $1 or subject_id in (${bookings})`, [user.id]);
  await q(`delete from pw_bookings where artist_id = $1`, [user.id]);
  await q(`delete from pw_notifications where user_id = $1`, [user.id]);
  await q(`delete from pw_consents where user_id = $1`, [user.id]);
  await q(`delete from artist_profiles where "userId" = $1`, [user.id]);
  await q(`delete from session where "userId" = $1`, [user.id]);
  await q(`delete from account where "userId" = $1`, [user.id]);
  await q(`delete from "user" where id = $1`, [user.id]);
}
