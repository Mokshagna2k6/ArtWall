# @artwall/db

Drizzle schema, the Postgres client, and the raw-SQL migrations.

## Layout

- `src/schema.ts` - Drizzle schema (`@artwall/db/schema`).
- `src/index.ts` - pooled `pool` + `db` client (`@artwall/db`). It does not import `server-only`; the app's shim at `apps/web/src/lib/db/index.ts` does, so `@/lib/db` stays server-only.
- `migrations/*.sql` - applied in filename order; the `_migrations` ledger is keyed by filename.
- `scripts/migrate.mjs`, `scripts/migrations-check.mjs` - the runner and the apply-twice check.
- `rls/` - reserved for row-level-security policies (none yet).

The package ships TypeScript source; `apps/web` consumes it via `transpilePackages`.
`apps/web/src/lib/db/{index,schema}.ts` are re-export shims so existing `@/lib/db` imports keep working.

## Env vars

- `DATABASE_URL` - runtime client. On Vercel this must be Neon's `-pooler` endpoint (PgBouncer).
- `DATABASE_URL_UNPOOLED` - optional direct URL, used by `migrations-check`.
- `PG_POOL_MAX` - per-instance pool size (default 5).

## Migrations

Run from the repo root (reads `apps/web/.env`):

    pnpm db:migrate
    pnpm --filter @artwall/db db:migrations-check   # needs a server it may create databases on

Or directly, with any `DATABASE_URL`: `node packages/db/scripts/migrate.mjs`.
Before adding a file: `ls packages/db/migrations | sort -V | tail -5`. Verify against a disposable Postgres first, never production.
