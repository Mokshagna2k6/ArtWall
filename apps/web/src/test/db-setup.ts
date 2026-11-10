import { afterAll, vi } from "vitest";

/**
 * Setup for the *.db.test.ts suite. Real database, real pg pool; only the
 * Next.js request context is faked: there is no request, so the session is
 * whatever the test says it is (`actAs`), and cache tags are no-ops.
 */

/**
 * Refuse to run against a hosted database.
 *
 * This suite is destructive by design: fixtures write real rows, and several
 * files mutate shared singletons — `escrow.db.test.ts` closes the open
 * `commission_policy_versions` row and reopens it in `afterEach`. If the run
 * is interrupted, or a restore hook fails, that row stays closed and the
 * platform has no active commission split.
 *
 * That is not hypothetical: it happened to this project's production database
 * on 2026-11-10, because `vitest.db.config.ts` only redirects the suite when
 * `TEST_DATABASE_URL` is set — passing `DATABASE_URL` on the command line is
 * silently overridden by `.env`, which points at production.
 *
 * So the guard lives here rather than in the config: this file is loaded by
 * every *.db.test.ts run no matter how vitest was invoked. Localhost and
 * container hosts only; anything else aborts before a single row is written.
 */
function assertDisposableDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return; // No URL: the pool itself will fail loudly. Not our call.

  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return; // Unparseable: let the driver produce the real error.
  }

  const disposable =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "postgres" || // docker-compose service name
    host === "db" ||
    host.endsWith(".local") ||
    host.endsWith(".internal");

  if (disposable) return;

  throw new Error(
    `Refusing to run the destructive DB suite against a non-local database (host: ${host}).\n\n` +
      `This suite rewrites shared rows (commission policy, catalogs) and has corrupted\n` +
      `production once already.\n\n` +
      `Start a throwaway Postgres and point the suite at it with TEST_DATABASE_URL:\n` +
      `  docker run -d -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:17\n` +
      `  DATABASE_URL_UNPOOLED=postgresql://postgres:test@localhost:55432/postgres \\\n` +
      `    node packages/db/scripts/migrate.mjs\n` +
      `  TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/postgres pnpm test:db\n\n` +
      `Note: DATABASE_URL alone is NOT enough — vitest.db.config.ts only honours\n` +
      `TEST_DATABASE_URL, and .env overrides anything else.`
  );
}

assertDisposableDatabase();

export interface TestUser {
  id: string;
  name: string;
  email: string;
}

const state = vi.hoisted(() => ({ user: null as TestUser | null, cookies: new Map<string, string>() }));

export function actAs(user: TestUser | null) {
  state.user = user;
}

/** The request cookies the next action sees (e.g. the UGC guest cookie). */
export function setTestCookie(name: string, value: string | null) {
  if (value === null) state.cookies.delete(name);
  else state.cookies.set(name, value);
}

/**
 * getSql() over the pg pool instead of Neon's HTTP driver. Same call shapes
 * (tagged template, `.query(text, params)`, rows back), but it speaks plain
 * TCP, so the suite runs against any Postgres: Neon locally, a service
 * container in CI.
 */
vi.mock("@/lib/db", async () => {
  const { pool } = await import("@/lib/db/index");
  const tagged = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""), "");
    return (await pool.query(text, values)).rows;
  };
  const sql = Object.assign(tagged, {
    query: async (text: string, params: unknown[] = []) => (await pool.query(text, params)).rows,
  });
  return { getSql: () => sql, DatabaseNotConfiguredError: class extends Error {} };
});

vi.mock("@/lib/session", () => ({
  getSessionUser: vi.fn(async () => state.user),
  getCurrentUser: vi.fn(async () => state.user),
  requireUser: vi.fn(async () => {
    if (!state.user) throw new Error("Unauthorized");
    return state.user;
  }),
}));

// better-auth's getSession, for modules that call it directly (coa, exhibitions…).
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => (state.user ? { user: state.user, session: {} } : null)),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` })),
  cookies: vi.fn(async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void state.cookies.set(name, value),
    delete: (name: string) => void state.cookies.delete(name),
  })),
}));

vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));

// DB_TEST_ROLE=artwall_app runs the whole suite as the least-privilege role
// (0035), the way production should connect. purgeTestData steps back to the owner.
const testRole = process.env.DB_TEST_ROLE;
if (testRole) {
  if (!/^\w+$/.test(testRole)) throw new Error(`bad DB_TEST_ROLE ${testRole}`);
  const { pool } = await import("@/lib/db/index");
  pool.on("connect", (client) => void client.query(`set role ${testRole}`));
}

afterAll(async () => {
  const { pool } = await import("@/lib/db/index");
  await pool.end().catch(() => {});
});
