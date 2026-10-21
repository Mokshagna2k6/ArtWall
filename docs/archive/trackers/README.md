# Archived task trackers

Ten task lists copied verbatim out of the Notion page
"ArtWall — Production Readiness Tracker"
(`https://app.notion.com/p/3e92da5aa27e8176bf9cf764996dab7b`) so that a coding
agent could verify its assignment from disk instead of trusting a prompt.

**Do not read the checkboxes as a status report.** Every box in every file here
is unticked, because the agents working these lists ticked *Notion*, not the
local copy. A file showing `- [ ] SEC-2.03` does not mean SEC-2.03 is
outstanding — SEC-2.03 (CSP nonces) is implemented, in
[`apps/web/src/proxy.ts`](../../../apps/web/src/proxy.ts). **Notion is the
canonical tracker.**

These files also contain session-specific agent instructions — "Do NOT spawn
sub-agents", "Report back", warnings about parallel worktrees, per-session
commit-message trailers. Those applied to one session in Sep–Oct 2026 and are
not project policy. Project policy is [`AGENTS.md`](../../../AGENTS.md).

What they are still good for: each item cites the Bible section and feature IDs
behind a requirement, and the "Critical context" sections record what an earlier
session had already verified about a given area. That provenance is why these
were archived instead of deleted.

| File | Pillar |
| --- | --- |
| `SEC-2-TASKS.md` | Security, phase 2 |
| `BE-3-TASKS.md` | Backend, phase 3 |
| `DB-3-TASKS.md` | Database, phase 3 |
| `FE-3-TASKS.md`, `FE-3-REMAINING-TASKS.md` | Frontend, phase 3 |
| `BC-1-TASKS.md`, `BC-2-TASKS.md`, `BC-3-TASKS.md` | Blockchain, phases 1–3 |
| `PERF-3-TASKS.md`, `PERF-3-REMAINING-TASKS.md` | Cache / rate limits / performance, phase 3 |
