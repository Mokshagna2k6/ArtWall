/**
 * The scheduled jobs, and when they run.
 *
 * ## Why these call HTTP endpoints instead of importing the job logic
 *
 * Every job's implementation lives in `apps/web` and reaches deep into it
 * through `@/` aliases — `@/lib/cron`, `@/lib/db`, `@/features/...`. Importing
 * that from here would mean either duplicating the logic (two implementations
 * that drift) or making this service depend on the whole Next.js app. So this
 * service is a *scheduler*: it owns the timing, `apps/web` keeps the one
 * implementation, and the handlers stay exactly as tested.
 *
 * That also makes the cutover reversible. These are the same endpoints Vercel
 * Cron was hitting, so deleting the `crons` array from `apps/web/vercel.json`
 * and starting this service moves the schedule without touching a handler; put
 * the array back and the schedule moves home again.
 *
 * ## Schedules
 *
 * The times below are the ones `vercel.json` used, preserved exactly — they
 * were already staggered to avoid overlapping work, and the ordering matters
 * in places (notifications are delivered before the retention sweep that might
 * remove their subjects).
 *
 * Unlike Vercel's Hobby plan, Railway has no daily-only restriction, so
 * `CRON_TZ` and sub-daily schedules are available here. The schedules are
 * deliberately left as they were for the cutover; tightening them is a
 * separate, observable change. `uptime-check` is the one job that is nearly
 * useless daily — see its note.
 */

/** @typedef {{ name: string, path: string, schedule: string, note?: string }} Job */

/** @type {Job[]} */
export const JOBS = [
  {
    name: "deliver-notifications",
    path: "/api/cron/deliver-notifications",
    schedule: "0 1 * * *",
    note: "Drains the pw_notifications outbox through Resend. Runs before data-retention so a notification is sent before its subject can be swept.",
  },
  {
    name: "refunds",
    path: "/api/cron/refunds",
    schedule: "15 1 * * *",
    note: "Processes open refunds against the Razorpay API.",
  },
  {
    name: "merkle-root",
    path: "/api/cron/merkle-root",
    schedule: "30 1 * * *",
    note: "Commits the pending certificate merkle root and submits it on-chain.",
  },
  {
    name: "reconcile-mints",
    path: "/api/blockchain/cron/reconcile-mints",
    schedule: "45 1 * * *",
    note: "Reconciles mint commitments against on-chain state. After merkle-root, which may create the work it reconciles.",
  },
  {
    name: "data-retention",
    path: "/api/cron/data-retention",
    schedule: "30 21 * * *",
    note: "DPDP retention sweep — deletes expired assets and PII.",
  },
  {
    name: "uptime-check",
    path: "/api/cron/uptime-check",
    schedule: "0 2 * * *",
    note: "Probes the public surfaces and alerts on failure. Daily was a Vercel Hobby constraint, not a design choice — a daily uptime check catches an outage up to 24h late. Railway can run this every few minutes; raising the frequency is a deliberate follow-up, not part of the cutover.",
  },
  {
    name: "demand-aggregate",
    path: "/api/cron/demand-aggregate",
    schedule: "15 2 * * *",
    note: "Rolls demand_signals up into demand_aggregates so page reads never recompute.",
  },
];
