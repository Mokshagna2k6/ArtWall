# Cache / Rate Limits / Performance Phase 3 task list — fetched verbatim from Notion

Source: https://app.notion.com/p/3e92da5aa27e8176bf9cf764996dab7b ("ArtWall — Production Readiness Tracker")
Fetched by the parent session via `mcp__notion__notion-fetch` and saved to this file so the task
list is verifiable from disk rather than taken on trust from a prompt.

---

- [ ] PERF-3.01. Production monitoring is in place: error tracking and structured logs for API routes and crons, with alerts on cron failure and on webhook failure rate. [Source: Bible section 128-135]
- [ ] PERF-3.02. Uptime checks exist for the home, marketplace, verify and Razorpay webhook health endpoints, with alerting. [Source: Bible section 128-135] (confirm scope: only a broad Bible section range is cited, not a specific requirement line)
- [ ] PERF-3.03. Rate limits for the PolicyEngine-gated high-value operations (mint, list, secondary sell) are defined per role and enforced. [Source: Bible section 119, section 102-119]
- [ ] PERF-3.04. The Demand Engine aggregation runs as a scheduled or incremental job, not per request, and demand reads are served from the aggregate. [Source: Bible section 42-45]
- [ ] PERF-3.05. The 3D exhibition assets are lazy-loaded with compressed textures (KTX2/Draco or equivalent), and the initial load budget is recorded and met on a mid-range mobile device. [Source: F65] (confirm scope: sourced from the original CTO Blueprint rather than the revised Bible architecture document)
- [ ] PERF-3.06. An incident runbook and on-call escalation path exist for payment, mint and data-breach incidents. [Source: Bible section 128-135, section 120-127]

## Dependency notes

- **PERF-3.03** depends on Backend Phase 3's PolicyEngine contract, which IS ready now — read
  `docs/policy-engine.md` in this worktree (already in your branch's history). The gate functions
  (`canMint`, `canList`, `canSecondarySell`) exist in `src/features/policy/engine.ts`. This task is
  about applying a persistent rate limit (same pattern as the existing `src/lib/rate-limit.ts` from
  Phase 1/2 — reuse it, don't reinvent) keyed appropriately per role to the routes/actions that will
  eventually call these gates. You can do the rate-limiting infrastructure now even if BE-3.03 (wiring
  the gates into real call sites) isn't done yet elsewhere — just make sure whatever you build applies
  cleanly once those call sites exist.
- **PERF-3.04** depends on Database Phase 3's Demand Engine tables (DB-3.14), which are being built in
  PARALLEL by a separate agent in worktree `agent-database-phase3` / branch `database-phase3-complete`,
  not yet merged into your branch. Do not guess at table names/columns. Either design the aggregation
  job's interface/shape now (documented) and stub the actual query against an assumed table name clearly
  marked TODO, or defer and report as blocked-on-database-phase3.
- **PERF-3.05** is independent — Three.js/3D asset work, same area Frontend Phase 3 is building the
  viewer for (worktree `agent-frontend-phase3`) but the loading/compression optimization itself doesn't
  require their work to exist first. Coordinate is possible but not required to start.
- **PERF-3.01, 3.02, 3.06** are fully independent of the other 3 Phase 3 tracks — safe to do first while
  waiting on anything blocked.

Prioritize PERF-3.01, 3.02, 3.06 (fully independent) and PERF-3.03 (contract already exists) first.
