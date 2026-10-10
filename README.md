# ArtWall

India's digital home for artists — exhibitions, a fair marketplace, and
blockchain-backed provenance. This repository is the pre-launch experience
site, built to create excitement and build a founding community of artists
ahead of the Diwali 2026 launch.

Design and product decisions in this codebase trace back to two source-of-truth
documents — never redesign what they specify without a documented reason:

- [`docs/ArtWall_Creative_Blueprint.md`](docs/ArtWall_Creative_Blueprint.md) — research, psychology, and the 100 scored experience ideas
- [`docs/ArtWall_Experience_Design_System.md`](docs/ArtWall_Experience_Design_System.md) — page-by-page UX, design tokens, motion and component system

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Server Components by default)
- [React 19](https://react.dev)
- TypeScript (strict mode)
- Tailwind CSS v4 (CSS-first theming via `@theme`)
- [shadcn/ui](https://ui.shadcn.com) (`base-nova` preset, Base UI primitives)
- Framer Motion for interaction/motion (GSAP and React Three Fiber added only
  where a specific feature justifies them)

## Prerequisites

- Node.js ≥ 22
- pnpm ≥ 10 (`corepack enable` will pick up the pinned version automatically)

## Getting started

```bash
pnpm install
cp apps/web/.env.example apps/web/.env   # then paste your Neon connection string (if .env.example is absent, create apps/web/.env)
pnpm db:migrate        # creates the waitlist table
pnpm dev
```

The dev server runs at [http://localhost:3000](http://localhost:3000).

## Environment

| Variable       | Required | Purpose                                               |
| -------------- | -------- | ----------------------------------------------------- |
| `DATABASE_URL` | Yes      | Neon Postgres connection string (pooled) for waitlist |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis for `@artwall/cache`; in-memory when unset |

Without `DATABASE_URL` the site still builds and renders — the roster count
falls back to zero and the join form reports a clear failure rather than
pretending a submission was saved. That degradation is deliberate: silently
losing a founding artist's registration is the worst possible outcome here.

## Database

Schema lives in [`db/migrations/`](db/migrations/) as plain SQL. Apply it with:

```bash
pnpm db:migrate
```

The runner records applied files in a `_migrations` table, so re-running is
safe and only new files execute. `founder_number` is a Postgres identity column
— the roster order is assigned by the database, never derived from a count,
because a count-based number is racy under concurrent signups.

## Scripts

| Script              | Purpose                                |
| ------------------- | -------------------------------------- |
| `pnpm dev`          | Start the local dev server (Turbopack) |
| `pnpm build`        | Production build                       |
| `pnpm start`        | Serve the production build             |
| `pnpm lint`         | Lint with ESLint                       |
| `pnpm typecheck`    | Type-check with `tsc --noEmit`         |
| `pnpm format`       | Format the repo with Prettier          |
| `pnpm format:check` | Check formatting without writing       |

## Project structure

```
apps/web/src/
  app/            Routes (one folder per page), root layout, global styles
  components/
    brand/        Logo and wordmark
    layout/       Header, footer, skip link, motion provider
    ui/           shadcn/ui primitives (brand-agnostic, no feature knowledge)
  features/       One folder per experience — archetype, certificate, hero,
                  india, journey, preview, wall, waitlist
  shared/         Composite components used by more than one feature
  lib/            Framework-agnostic utilities (cn, motion tokens, db, rate-limit)
  config/         Site constants — site.ts, nav.ts, products.ts
  types/          Domain models shared across features
db/migrations/    Plain-SQL schema
apps/web/scripts/  Migration runner and DB tooling
apps/api, packages/*  Placeholders (backend + extracted packages)
docs/             Product research, UX, and design-system source-of-truth docs
```

**Naming convention:** lowercase kebab-case filenames throughout — matching what
shadcn/ui generates, so the codebase has one convention instead of two.

**Component tiers:** `components/` holds primitives with zero feature knowledge;
`features/<name>/` holds components that only make sense for one page or flow;
`shared/` holds composite components reused across more than one feature. If
something is used once it stays in `features/` — promote it only when a second
feature needs it.

**Server-first:** pages are Server Components by default; `"use client"` appears
only where an interaction genuinely requires it (the wall claim, the preview
uploader, the quiz, the form, the cursor spotlight). Every page in the build
output is statically prerendered.
