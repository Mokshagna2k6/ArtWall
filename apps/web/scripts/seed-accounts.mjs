/**
 * Seed the three test accounts: master admin, staff, artist.
 *
 * Roles already exist on the user row (see src/features/physical-wall/authorize.ts);
 * this just creates real credential logins for each one so the admin console,
 * the staff surfaces and an ordinary artist journey can all be exercised.
 *
 * SEC-3.02/3.03: this script (run once, out-of-band, never from live
 * request-handling code) is now the ONLY bootstrap for the first admin.
 * There is no live-request path that promotes anyone to `admin` anymore
 * (the old ADMIN_EMAILS allowlist check inside `getActor` was removed) —
 * grants after this point go through `grantAdminRole`
 * (src/features/physical-wall/actions/admin-roles.ts), which itself
 * requires an existing `super_admin`. So the master admin seeded here is
 * also given the `super_admin` admin role directly in the database, below,
 * the one place it is still acceptable to assign a role without going
 * through that action — this script IS the bootstrap of first resort.
 *
 * Passwords are hashed with Better Auth's own hasher, so these sign in through
 * the normal /sign-in form with no special-casing anywhere in the app.
 *
 * Idempotent — re-running resets the password and role of the same three
 * emails rather than creating duplicates.
 *
 * Usage:  node --env-file=.env scripts/seed-accounts.mjs
 *         SEED_PASSWORD=... node --env-file=.env scripts/seed-accounts.mjs
 */
import { randomBytes, randomUUID } from "node:crypto";

import pg from "pg";
/**
 * Accounts are created through Supabase Auth's Admin API (migration 0074).
 * Writing a password hash into `account` no longer authenticates anything:
 * Supabase Auth owns credentials, and `account` is a kept-but-empty
 * better-auth leftover. The uuid must come FROM auth.users, because
 * `public."user"` is keyed by it and the handle_new_user trigger creates that
 * profile row.
 */
async function createAuthUser({ email, password, name }) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to seed accounts."
    );
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const res = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } }),
  });
  if (res.ok) return (await res.json()).id;

  // Re-seeding must rotate the password, not fail on an existing account.
  const body = await res.text();
  if (!/already|exists|registered/i.test(body)) {
    throw new Error(`Could not create ${email}: ${res.status} ${body.slice(0, 200)}`);
  }
  const list = await fetch(`${base}/auth/v1/admin/users?per_page=1000`, { headers });
  const found = (await list.json()).users?.find((u) => u.email === email);
  if (!found) throw new Error(`${email} reported as existing but was not found.`);
  await fetch(`${base}/auth/v1/admin/users/${found.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ password, email_confirm: true, user_metadata: { name } }),
  });
  return found.id;
}

import { assertSafeSeedTarget } from "./seed-guard.mjs";

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Run with:  node --env-file=.env scripts/seed-accounts.mjs"
  );
  process.exit(1);
}

// Hostname guard, not a NODE_ENV guard. NODE_ENV is "development" or unset
// whenever a human runs this at a terminal with --env-file=.env, and that .env
// points at the live Neon instance — so the old NODE_ENV check passed in
// exactly the case that mattered. The host in the connection string is the
// only fact that identifies the target database. Fails closed; never prints
// the connection string. Shared with the demo seed/purge scripts.
try {
  assertSafeSeedTarget(process.env.DATABASE_URL);
} catch (error) {
  console.error(`REFUSED: ${error.message ?? error}`);
  console.error(
    "This script bootstraps the first admin and is allowed to run against a " +
      "real non-production database, but never against production."
  );
  process.exit(1);
}

// `pg`, not the Neon HTTP driver: that driver speaks Neon's own protocol and
// rewrites a Supabase host into api.pooler.supabase.com, which does not exist.
// Same root cause as the rewrite of src/lib/db.ts for migration 0074.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/** Tagged template over `pg`, matching the shape the rest of this file uses. */
const sql = (strings, ...values) =>
  pool
    .query(
      strings.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""), ""),
      values
    )
    .then((r) => r.rows);

/** One password for all three, so a tester has one thing to remember. */
const password =
  process.env.SEED_PASSWORD ?? `test-${randomBytes(9).toString("base64url")}`;

const ACCOUNTS = [
  {
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@artwall.test",
    name: "Master Admin",
    role: "admin",
  },
  {
    email: process.env.SEED_STAFF_EMAIL ?? "staff@artwall.test",
    name: "Wall Staff",
    role: "staff",
  },
  {
    email: process.env.SEED_ARTIST_EMAIL ?? "artist@artwall.test",
    name: "Test Artist",
    role: "artist",
  },
];

for (const { email, name, role } of ACCOUNTS) {
  const userId = await createAuthUser({ email, password, name });

  const [existing] = await sql`
    select id from "user" where id = ${userId} limit 1
  `;

  if (existing) {
    await sql`
      update "user"
      set role = ${role}, name = ${name}, "emailVerified" = true, "updatedAt" = now()
      where id = ${userId}
    `;
  } else {
    await sql`
      insert into "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
      values (${userId}, ${name}, ${email}, true, ${role}, now(), now())
    `;
  }

  // No `account` row: Supabase Auth holds the credential (migration 0074).

  // SEC-3.03: give the master admin the super_admin named role too, so there
  // is a real super-admin able to grant the other 7 roles via grantAdminRole
  // once seeding is done. Idempotent via the live-assignment unique index.
  if (role === "admin") {
    const [superAdminRole] = await sql`
      select id from admin_roles where name = 'super_admin' limit 1
    `;
    if (superAdminRole) {
      const [existing] = await sql`
        select id from admin_role_assignments
        where user_id = ${userId} and role_id = ${superAdminRole.id} and revoked_at is null
        limit 1
      `;
      if (!existing) {
        await sql`
          insert into admin_role_assignments (id, user_id, role_id, granted_by)
          values (${`ara_seed_${userId}`}, ${userId}, ${superAdminRole.id}, null)
        `;
      }
    }
  }

  console.log(`  ${role.padEnd(6)}  ${email}`);
}

console.log(`\nPassword for all three: ${password}`);
console.log("Sign in at /sign-in. Admin console: /physical-wall/admin\n");
