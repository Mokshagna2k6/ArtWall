# @artwall/api — Railway scheduler

Runs the seven scheduled jobs that used to run on Vercel Cron.

This service owns **timing only**. Each job's implementation stays in
`apps/web`, behind the same HTTP endpoint it already had; this service calls
those endpoints on a schedule with the shared `CRON_SECRET`.

## Why it works this way

Every job reaches deep into `apps/web` through `@/` aliases — `@/lib/cron`,
`@/lib/db`, `@/features/physical-wall/...`. Importing that here would mean
either duplicating the logic (two implementations that drift apart) or making
this service depend on the whole Next.js app. Neither is worth it for seven
HTTP calls a day.

The upside is that the cutover is reversible and observable: these are the
exact endpoints Vercel Cron was hitting, the handlers are unchanged and still
covered by their existing tests, and moving the schedule back is a matter of
restoring the `crons` array in `apps/web/vercel.json`.

It also lifts a real constraint. Vercel's Hobby plan allows **daily** crons
only, which this project had already hit — `uptime-check` running once a day
can miss an outage by 24 hours. Railway has no such limit, so the frequency is
now a decision rather than a restriction. The schedules are deliberately
unchanged for the cutover; raising them is a separate, observable step.

## The jobs

Defined in [`src/jobs.js`](src/jobs.js), with the times `vercel.json` used,
preserved exactly — they were already staggered, and the order matters in
places (notifications are delivered before the retention sweep that could
remove their subjects).

| Job | Schedule | Endpoint |
| --- | --- | --- |
| `deliver-notifications` | 01:00 | `/api/cron/deliver-notifications` |
| `refunds` | 01:15 | `/api/cron/refunds` |
| `merkle-root` | 01:30 | `/api/cron/merkle-root` |
| `reconcile-mints` | 01:45 | `/api/blockchain/cron/reconcile-mints` |
| `data-retention` | 21:30 | `/api/cron/data-retention` |
| `uptime-check` | 02:00 | `/api/cron/uptime-check` |
| `demand-aggregate` | 02:15 | `/api/cron/demand-aggregate` |

Times are in `CRON_TZ`, default `Asia/Kolkata`. Vercel Cron was UTC-only, so
**this is a real change in when jobs fire** — intentional, since the business
runs on IST, but worth knowing when comparing logs across the cutover.

## Behaviour

- **Retries:** 3 attempts per tick with exponential backoff (5s, 10s).
- **No retry on 4xx.** A wrong `CRON_SECRET` returns 401 and will return 401
  forever; retrying wastes attempts and delays the log line that says what is
  broken.
- **Timeout:** 10 minutes per attempt, well clear of the retention sweep.
- **Overlap protection:** a tick arriving while the previous run is still going
  is skipped, not started alongside. These jobs write to shared tables and are
  not concurrency-safe against themselves.
- **Graceful shutdown:** SIGTERM stops new ticks and lets an in-flight job
  finish. A refund sweep killed mid-run is worse than a late one.
- **Logs** use the same shape as `runCron` in `apps/web/src/lib/cron.ts`
  (`cron.start` / `cron.end` / `cron.error` with `job` and `durationMs`), so one
  query across both services gives a single timeline.
- **Alerting is not duplicated.** `runCron` already alerts admins when a handler
  throws. This service only logs failures the handler never saw — unreachable,
  or refused — which are exactly the ones `runCron` cannot report.

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /health` | Railway health check |
| `GET /status` | Each job's schedule, next run and last outcome |
| `POST /trigger/<job>` | Re-run one job now. **Requires the `CRON_SECRET` bearer token** — it can move money (refunds) and delete data (retention) |

## Deploying

Create a Railway service from this repo and set:

- **Root Directory:** the repository root, **not** `apps/api`. This is a pnpm
  workspace, so the install needs `pnpm-lock.yaml` and `pnpm-workspace.yaml`.
- **Dockerfile path:** `apps/api/Dockerfile`
- **Variables:** see [`.env.example`](.env.example) — `WEB_APP_URL` and
  `CRON_SECRET` are required.

`railway.json` already sets the start command, the `/health` check and an
on-failure restart policy.

### Cutover

1. Deploy this service and confirm `GET /status` lists all seven jobs with a
   sensible `nextRun`.
2. Trigger one safe job manually to prove auth works end to end:
   `curl -X POST -H "Authorization: Bearer $CRON_SECRET" <railway-url>/trigger/demand-aggregate`
3. Only then remove the `crons` array from `apps/web/vercel.json`.

> **Status 2026-10-21: the crons are still on Vercel.** Railway had paused new
> deploys platform-side when this shipped, so the array was deliberately left
> in `vercel.json` rather than leaving the seven jobs unscheduled. Nothing runs
> twice today because this service is not deployed. Remove the array in the
> same change that brings this service up, not before.

## Local

```bash
pnpm --filter @artwall/api dev     # reads apps/web/.env
pnpm --filter @artwall/api test    # 10 tests, no network — fetch is stubbed
```
