# Tests

True counts as of 2026-09-28. Earlier docs quoted "212 tests"; that number
came from vitest collecting every test two or three times over from agent
worktree copies of `src/` (`.claude/worktrees`, `.kilo`). `vitest.config.ts`
now excludes those, so the counts below are unique tests.

| Suite | Command | Files | Tests | Needs |
|---|---|---|---|---|
| Unit | `pnpm test` | 8 | 126 | nothing (hermetic) |
| Integration | `pnpm test:db` | 10 | 37 | `DATABASE_URL`, Cloudinary creds in `.env` |
| **Total** | | **18** | **163** | |

Flakiness: the unit suite passed 10/10 consecutive runs and the integration
suite 2/2 (the one known flaky test, the QR tampered-id case, was made
deterministic in c456f6b). The integration suite is slow (~8 min) because
every statement is a round trip to Neon.

## What is covered

Unit (`*.test.ts`): slot state machine, money/paise arithmetic, pricing and
refund maths, QR token signing, webhook signature checks, RBAC helpers,
Keccak-256 + sorted-pair Merkle trees (1–17 leaves, checked against a
reference implementation), COA metadata hashing, concurrent reservation.

Integration (`*.db.test.ts`, real Postgres; Razorpay HTTP is faked because a
captured payment needs a human at Checkout; Resend is faked; **Cloudinary is
real**):

- payments: client verify + webhook settle once; webhook alone; forged
  signature; late capture on a re-taken slot is auto-refunded; wrong amount;
  offline mark-paid audit
- refunds: pending → processed; Razorpay failure → failed → cron retry;
  crash after Razorpay accepted → retry finds it, never refunds twice
- invoices: CGST/SGST split, venue place of supply, GSTIN validation;
  revenue report gross/refund/net deltas
- install capacity and same-slot clash
- COA issue/provenance/edition, /verify timeline, mint royalty + wallet guard
- marketplace category / price / unpublished-artist filters
- exhibition publish, curator approve/suspend + audit
- condition photos and damage records
- notifications: all 13 templates render and deliver; retry → failed; the
  scheduled sweep dedupes
- DPDP export contents; erasure atomicity; erasure deletes sessions, OAuth
  links, rows and real Cloudinary files; failed file deletes retry
- UGC submission stores the Cloudinary public id

Fixture rows use ids prefixed `betest_` and are removed by `purgeTestData()`
(`src/test/fixtures.ts`) after each file.

## CI (`.github/workflows/ci.yml`)

Every push to every branch and every pull request. Job `check`: typecheck,
lint, build. Job `test`: a `postgres:17` service container, every migration
applied (`scripts/migrate.mjs`) and the catalogs seeded, then both suites with
`--coverage --reporter=blob`, then `vitest --merge-reports --coverage`, which
enforces the per-module floors in `vitest.config.ts` (payment, invoice, UGC,
NFT routes) on the merged numbers. The HTML report is uploaded as the
`coverage` artifact and the totals go in the job summary.

With no `.env` (CI) the integration suite runs on stand-in secrets
(`vitest.db.config.ts`); `dpdp.db.test.ts` needs real Cloudinary and skips
unless the `CLOUDINARY_*` repository secrets are set.

To reproduce locally against Docker instead of the shared dev database:

    docker run -d --name pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17
    export DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres
    node scripts/migrate.mjs && node scripts/seed-physical-wall.mjs
    TEST_DATABASE_URL=$DATABASE_URL pnpm test:db

Not covered by automated tests: UI components, E2E journeys, the real
Razorpay API (the test keys in `.env` currently fail authentication with
401, see below), email delivery through a real provider.
