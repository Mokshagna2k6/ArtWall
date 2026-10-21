# Archived audits

Five audit documents from August–September 2026. They are superseded as status
reports but kept because they are the only written record of *why* several
things in the current code look the way they do.

**Read the verdicts as historical.** `FINAL_PRODUCTION_READINESS.md` opens with
**NOT READY** — that was the verdict on 22 Aug 2026 against spec
`WMS-SPEC-001`. It is not a current assessment. `PRODUCTION_AUDIT.md` even cites
the codebase as `a:\All projects\ArtWall`, a path this project no longer uses.

## What supersedes what

The three 22 Aug documents (`PRODUCTION_AUDIT.md`,
`PRODUCTION_GAP_ANALYSIS.md`, `FINAL_PRODUCTION_READINESS.md`) audit against
`WMS-SPEC-001` v1.0. `WMS_V1.1_SPEC_AUDIT.md` audits against the later
`WMS-SPEC-002` v1.1 and says so itself: its §6 carries forward a deduplicated
list of the earlier findings. **If two of these disagree, the v1.1 audit is the
later analysis** — but verify either against the code before acting.

`PHYSICAL_WALL_AUDIT.md` is a different axis again: prototype JSX vs the
Next.js implementation, by a different tool (Kilo).

## Status of the three bugs named in the v1.1 audit

Re-checked 21 Oct 2026 while archiving:

| Finding | Status now |
| --- | --- |
| UGC submission broken | Route exists: [`apps/web/src/app/api/physical-wall/ugc/upload-signature/route.ts`](../../../apps/web/src/app/api/physical-wall/ugc/upload-signature/route.ts) |
| Public search broken | Route exists: [`apps/web/src/app/api/physical-wall/search/route.ts`](../../../apps/web/src/app/api/physical-wall/search/route.ts) |
| Duplicate migration number | **Still true.** `0057_be3_escrow_release_state.sql` and `0057_collections_rebuild.sql` both exist |

The duplicate `0057` is harmless in practice — the migration ledger is keyed by
filename, not by parsed number, so both files apply exactly once. `AGENTS.md`
documents this and tells you to run
`ls packages/db/migrations | sort -V | tail -5` before adding a migration rather
than trusting a number. Renumbering an applied migration would be worse than the
wart, so it stays.

Two modules the v1.1 audit found entirely missing — Sponsors, and
Events/Workshops — were not re-verified during archiving. Treat them as open
until checked.
