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

import { neon } from "@neondatabase/serverless";
import { hashPassword } from "better-auth/crypto";

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Run with:  node --env-file=.env scripts/seed-accounts.mjs"
  );
  process.exit(1);
}

if (process.env.NODE_ENV === "production" && !process.env.SEED_PASSWORD) {
  console.error(
    "Refusing to seed test accounts in production without an explicit SEED_PASSWORD."
  );
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

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

const hash = await hashPassword(password);

for (const { email, name, role } of ACCOUNTS) {
  const [existing] = await sql`
    select id from "user" where lower(email) = ${email.toLowerCase()} limit 1
  `;

  const userId = existing?.id ?? randomUUID();

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

  // The credential row Better Auth checks on email+password sign-in. One per
  // user; updated rather than duplicated so re-seeding rotates the password.
  const [credential] = await sql`
    select id from "account"
    where "userId" = ${userId} and "providerId" = 'credential'
    limit 1
  `;

  if (credential) {
    await sql`
      update "account"
      set password = ${hash}, "updatedAt" = now()
      where id = ${credential.id}
    `;
  } else {
    await sql`
      insert into "account"
        (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      values
        (${randomUUID()}, ${userId}, 'credential', ${userId}, ${hash}, now(), now())
    `;
  }

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
