/**
 * The production-host guard for every seeding/purging script.
 *
 * Why hostname and not NODE_ENV: NODE_ENV is "development" (or unset) whenever
 * a human runs `node --env-file=.env scripts/...` at a terminal, which is
 * exactly how these scripts get run — and apps/web/.env points at the live
 * Neon instance. A NODE_ENV check therefore passes precisely in the case that
 * matters. The host in the connection string is the only fact that actually
 * identifies the target database, so that is what we check.
 *
 * Fails closed: an unparseable or hostless connection string is refused, not
 * waved through. The connection string itself is never printed (AGENTS.md:
 * never echo credentials) — only the hostname, which carries no secret.
 */

/**
 * Neon endpoint ids of databases that must never be seeded. Substring match,
 * so the pooler/direct variants and any region suffix of the same endpoint are
 * all covered by one entry.
 */
const FORBIDDEN_HOST_FRAGMENTS = [
  // The old Neon production host. Stale since the Supabase migration
  // (2026-10-21): nothing connects here any more, so this entry guards nothing.
  "ep-royal-wildflower",

  // TODO before launch: add the PRODUCTION Supabase project ref here.
  //
  // Right now this list protects NOTHING. The current Supabase project
  // (nibhjciuatdfljwicykm) is deliberately left out because it is the active
  // dev/staging database and is seeded regularly — adding it would break
  // `seed-demo.mjs` and `seed-accounts.mjs` against the only database there is.
  //
  // The moment a separate production project exists, its ref goes here, or
  // `seed-demo.mjs --purge` will wipe production without complaining.
];

// shortcut: seed guard currently blocks only a dead Neon host. Add the real
// production project ref as soon as prod and dev are separate projects.

export class SeedGuardError extends Error {}

/**
 * Resolve the hostname of a connection string, or throw. Exported for tests.
 * @param {string | undefined} url
 * @returns {string} lowercase hostname
 */
export function hostOf(url) {
  if (!url || !url.trim()) {
    throw new SeedGuardError("No database URL given.");
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new SeedGuardError("Database URL could not be parsed.");
  }
  const host = parsed.hostname.toLowerCase();
  if (!host) throw new SeedGuardError("Database URL has no hostname.");
  return host;
}

/**
 * True when `host` is a database we refuse to write seed data to. Exported for tests.
 * @param {string} host
 */
export function isForbiddenHost(host) {
  const h = host.toLowerCase();
  return FORBIDDEN_HOST_FRAGMENTS.some((fragment) => h.includes(fragment));
}

/**
 * Assert the target is safe to seed, and return its hostname for logging.
 * Throws SeedGuardError on anything it cannot positively clear.
 * @param {string | undefined} url
 * @returns {string} the cleared hostname
 */
export function assertSafeSeedTarget(url) {
  const host = hostOf(url);
  if (isForbiddenHost(host)) {
    throw new SeedGuardError(
      `Refusing to run: ${host} is the PRODUCTION database. ` +
        "Point SEED_DATABASE_URL at a Neon branch (see docs/runbooks/SEED-DATA.md) and run again."
    );
  }
  return host;
}

/**
 * The entry point a script calls. Resolves the URL from SEED_DATABASE_URL
 * (preferred — it cannot be inherited from apps/web/.env by accident) or
 * DATABASE_URL, guards it, prints the cleared host, and hands back the URL.
 *
 * @param {{ allowDatabaseUrl?: boolean }} [opts]
 * @returns {{ url: string, host: string }}
 */
export function resolveSeedTarget(opts = {}) {
  const { allowDatabaseUrl = true } = opts;
  const url =
    process.env.SEED_DATABASE_URL ?? (allowDatabaseUrl ? process.env.DATABASE_URL : undefined);

  if (!url) {
    console.error(
      "SEED_DATABASE_URL is not set.\n" +
        "Seeding never defaults to apps/web/.env, because that file points at production.\n" +
        "Run with:  SEED_DATABASE_URL='postgres://...branch-host/neondb' node scripts/seed-demo.mjs\n" +
        "See docs/runbooks/SEED-DATA.md."
    );
    process.exit(1);
  }

  try {
    const host = assertSafeSeedTarget(url);
    console.log(`Target database host: ${host}`);
    return { url, host };
  } catch (error) {
    console.error(
      error instanceof SeedGuardError ? `REFUSED: ${error.message}` : `REFUSED: ${error}`
    );
    process.exit(1);
  }
}
