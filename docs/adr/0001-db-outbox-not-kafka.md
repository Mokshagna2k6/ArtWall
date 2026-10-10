# ADR 0001: DB-table outbox instead of Kafka/a message broker (MVP)

- Status: Accepted (MVP). Superseded when a migration trigger below is hit.
- Task: BE-3.21 [Source: F70]
- Date: 2026-10-05

## Context

ArtWall needs an asynchronous "tell someone something" mechanism: booking
confirmations, install reminders, hold-expiry warnings, grievance replies,
identity verification results, admin alerts. The requirement (from the
original scope) named Kafka as the eventual broker for this kind of
fan-out/async-delivery work. This ADR documents why MVP does **not** build
Kafka, what was built instead, and the concrete conditions under which the
project should actually migrate.

This is a documentation-only task. No broker was built or evaluated as code;
the alternative described below (a Postgres table) is already implemented
and in production use, not a proposal.

## What was actually built

A single Postgres table, `pw_notifications` (`db/migrations/0009_production_readiness.sql`,
extended by `0026_notification_dedupe.sql` and `0038_be2_notification_outbox.sql`),
used as a transactional outbox:

- **Enqueue is transactional-adjacent, not a side channel.** Every place in
  the app that wants to notify someone calls `queueNotification` /
  `notify` / `notifyUser` (`src/features/physical-wall/notifications.ts`),
  which does a plain `insert ... on conflict (dedupe_key) do nothing` and
  returns immediately. Enqueue failures are caught and logged, never thrown
  into the caller's flow — a booking must not fail because a notification
  row couldn't be written.
- **Delivery is a separate, idempotent consumer.** `deliverPendingNotifications`
  claims due rows with `update ... where id in (select ... for update skip
  locked)`, so two overlapping runs (the daily cron and the admin's "send
  pending now" button) get disjoint rows — this is the DB doing what a
  broker's consumer-group partition assignment would otherwise do, at a
  scale of one consumer.
- **Resend (the email provider) gets the row id as `Idempotency-Key`,**
  so a run that dies after Resend accepts the message but before the row is
  marked `sent` is safe to retry — the provider drops the duplicate.
- **Retry/backoff/dead-letter (BE-2.12/2.13):** failures move `pending` →
  `retrying` with exponential backoff (`retryDelayMinutes`: 4^attempts
  minutes — 1, 4, 16, 64) and after `MAX_NOTIFICATION_ATTEMPTS = 5` moves to
  `dead`, visible on the admin overview (`listDeadNotifications`). A stale
  `sending` claim (run crashed mid-delivery) is reclaimable after 10 minutes.
- **Scheduling is one cron, once a day.** `/api/cron/deliver-notifications`
  (`src/app/api/cron/deliver-notifications/route.ts`) runs
  `queueScheduledNotifications()` (time-based reminders, deduped by key) then
  `deliverPendingNotifications(50, undefined, until)` under a 30s
  `maxDuration`. It is scheduled `0 1 * * *` in `vercel.json` — **once per
  day**, because the project is on Vercel's Hobby plan, which only permits
  daily cron schedules (confirmed constraint; see `docs/incident-runbook.md`
  and `PERF-3-REMAINING-TASKS.md`). There is also a manual "send pending now"
  admin action that invokes the same delivery function outside the cron tick.
- Covered by `src/features/physical-wall/__tests__/notifications.db.test.ts`:
  `"a Resend failure goes to 'retrying' with backoff, then dead-letters after
  max attempts (BE-2.12)"` and `"overlapping delivery runs send each message
  exactly once (BE-2.13)"` and `"a stale claim (run died mid-send) is retried
  with the same idempotency key"`.

## Why this, not Kafka, for MVP

1. **Volume does not need a broker.** The only consumers are: (a) this one
   delivery job, and (b) nothing else — there is no second service reading
   this queue, no fan-out to multiple independent consumer groups, no stream
   processing. Kafka's value (partitioned high-throughput log, multiple
   consumer groups replaying independently) has no current user in this
   codebase.
2. **The real-world delivery cadence is once a day, not real-time.** Because
   the project runs on Vercel Hobby (daily-cron-only), the actual latency
   budget for a queued notification is "up to ~24h plus the manual
   admin-triggered flush", not sub-second. A broker's low-latency delivery
   guarantees solve a problem this deployment doesn't have given its own
   infra tier.
3. **One fewer moving part, one fewer credential, one fewer thing to operate.**
   No broker cluster, no consumer group management, no separate deploy
   target, no new secret. The outbox lives in the same Postgres instance
   already used for every other write, inside the same migration/backup
   story.
4. **Ordering and exactly-once-ish delivery are already satisfied by
   Postgres primitives** (`for update skip locked` for exclusive claims +
   provider idempotency key for retry-safety), which is what the app
   actually needs here — not Kafka's stronger partition-ordering guarantees.
5. **Postgres is already the single source of truth.** The outbox pattern
   keeps "did we tell the user" in the same transactional store as "did the
   booking happen," so there is no dual-write problem to reconcile across
   two systems.

## Real, current limits of the DB-table outbox (not guessed)

- **Single-instance throughput.** All claiming goes through one Postgres
  table with `for update skip locked`; this comfortably handles the current
  volume (per-booking/per-artist transactional notifications, a handful of
  scheduled sweeps) but a naive `select`-then-`update` over a growing table
  will start to show lock contention and scan cost well before anything
  Kafka-scale — there is no benchmark in this codebase, so no specific
  messages/sec ceiling is claimed here; see trigger conditions below instead
  of a number pulled from nowhere.
- **Delivery is batch-bounded.** `deliverPendingNotifications(limit = 25)`
  from the manual path, `50` from the cron path, each cron run capped at
  `maxDuration = 30` seconds. If the backlog ever exceeds what 50 rows /
  30 seconds can drain once a day, the backlog grows unbounded between runs.
- **One consumer, one delivery channel wired up (email via Resend).**
  `channel` supports `sms` / `in_app` in the schema, but only `email` is
  ever claimed by `deliverPendingNotifications` (`channel = 'email'` is
  hard-coded into the `due` predicate) — sms/in_app rows would queue
  forever undelivered today. There is no fan-out to multiple independent
  consumers of the same event; there is exactly one thing reading this
  table.
- **No replay / stream semantics.** Once a row is `sent`, it is not
  re-deliverable as an event to a new consumer that shows up later. A
  broker's log-retention/replay model does not exist here — if a future
  feature needs "replay every booking-confirmed event from the last 7 days
  to a new analytics consumer," this table cannot do that without a schema
  change.
- **Cadence is coupled to the hosting plan, not the architecture.** The
  once-a-day schedule is a Vercel Hobby constraint, not a design limit of
  the outbox pattern itself — moving to a paid Vercel plan (or any host with
  sub-daily cron/always-on workers) would let this same table be drained
  every minute with no code change, which is the first and cheapest lever
  before considering a broker at all.

## Migration trigger conditions (when to actually build the Kafka/broker path)

Any **one** of the following, confirmed in production rather than
anticipated, is the trigger to replace or augment this outbox:

1. **Multiple independent consumers need the same event stream.** E.g. a
   future analytics pipeline, a future SMS provider, and email delivery all
   need to react to `booking.confirmed` independently, with their own
   replay/offset semantics. One table with one `status` column cannot serve
   multiple independent consumer cursors over the same row.
2. **Sustained throughput that visibly contends the claim query.** If
   `deliverPendingNotifications`'s claim `UPDATE` (or the `due` backlog
   count) is observed taking long enough to risk the 30s `maxDuration`
   cron budget at normal (non-incident) volume — i.e., the real backlog
   count from `countPendingNotifications()` routinely approaches the
   `limit` before a run even starts — that is the concrete, measurable
   signal to act on, rather than a guessed messages/sec number.
3. **A latency requirement tighter than "next cron tick" that cannot be met
   by upgrading the Vercel plan.** If a product requirement needs
   notification delivery within, say, single-digit minutes of the triggering
   event, first move the cron to a paid-plan sub-daily schedule (cheap,
   no architecture change); only if that is insufficient — e.g. true
   push/streaming delivery across services — does a broker become
   justified.
4. **Cross-service / multi-deployable consumption.** If ArtWall splits into
   more than one deployable service (e.g. a separate worker fleet, a
   separate notifications microservice) that needs to consume the same
   event stream ArtWall produces, a broker's decoupling of producer and
   consumer deploys becomes valuable in a way a single app's Postgres table
   is not.
5. **Need for genuine replay/audit of an event stream** (not just the
   dead-letter table of failed sends that already exists), e.g. reprocessing
   historical events into a new consumer that didn't exist when the events
   were first produced.

None of these conditions is currently true in this codebase: there is one
consumer, volume is low enough that a 25–50 row batch drains the backlog
comfortably within the 30s cron budget, and the real latency bottleneck
today is the Vercel Hobby daily-cron ceiling, not the outbox pattern itself.

## Consequences

- Accepted: notification delivery can lag up to ~24h (mitigated by the
  manual "send pending now" admin action) in the current deployment, which
  is a Vercel plan choice, not an outbox limitation, and is disclosed here
  rather than silently assumed to be real-time.
- Accepted: only one delivery channel (email) is actually wired to the
  consumer despite the schema modeling `sms` and `in_app`; those channels
  queue but never deliver until the consumer is extended.
- If/when a trigger condition above is hit, the migration path is additive,
  not a rewrite: `queueNotification` already centralizes every enqueue
  call site, so swapping the consumer side (or adding a broker-backed
  second consumer) does not require touching the ~15 call sites across the
  app that produce notifications today.
