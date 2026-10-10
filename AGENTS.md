<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repo layout (pnpm workspace, `production-v2`)

- `apps/web` is the Next.js app (`src/`, `scripts/`, configs, `.env`). Run app commands from the root (`pnpm dev|build|typecheck|lint|test`) or with `pnpm --filter @artwall/web <script>`; `node_modules/next/dist/docs/` resolves under `apps/web/node_modules/next` (or the root `node_modules/.pnpm`).
- `db/migrations` and `contracts/` stay at the repo root for now; `apps/web/scripts/*.mjs` reach them via `../../db`. DB scripts read `apps/web/.env`.
- `apps/api` and `packages/*` are placeholders until each is extracted (see `docs/plans/PRODUCTION_SCALE_PLAN.md` §2c/§2d).
