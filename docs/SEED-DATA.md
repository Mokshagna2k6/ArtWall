# Seed / dummy data

How to put a full demo dataset on a **non-production** database, and how to take
it off again. Decided in `CHANGES-PLAN.md` §23; the data obeys `BIBLE.md`.

- Seed + purge script: `apps/web/scripts/seed-demo.mjs`
- Production-host guard: `apps/web/scripts/seed-guard.mjs` (+ its test,
  `apps/web/src/features/physical-wall/__tests__/seed-guard.test.ts`)
- Credentials: written to `SEED-CREDENTIALS.md` at the repo root, **gitignored**

---

## 1. The production guard — read this first

**`apps/web/.env`'s `DATABASE_URL` points at production** (`ep-royal-wildflower`,
HANDOFF.md §2). Every seeding script therefore refuses to use it.

The guard checks the **hostname of the connection string**, not `NODE_ENV`:

> `NODE_ENV` is `development` or unset whenever a human runs
> `node --env-file=.env scripts/...` at a terminal — which is exactly how these
> scripts get run. A `NODE_ENV === "production"` check passes in precisely the
> case that matters, so it is not a guard at all. The host is the only fact that
> identifies the target database.

Guard behaviour:

| Target | Result |
|---|---|
| `ep-royal-wildflower…` (pooler, direct, any case) | **REFUSED**, exit 1 |
| another Neon endpoint (a branch) | allowed |
| `localhost` / a Docker Postgres | allowed |
| unparseable, empty, or missing URL | **REFUSED**, exit 1 (fails closed) |

The connection string is never printed — only the hostname, which holds no
secret.

Seeding reads **`SEED_DATABASE_URL`**, not `DATABASE_URL`, so a production URL
cannot be inherited from `.env` by accident. Omitting it refuses outright rather
than falling back.

To add another protected host, extend `FORBIDDEN_HOST_FRAGMENTS` in
`seed-guard.mjs` (substring match, so pooler/direct variants are both covered by
one entry).

### The pre-existing script was also fixed

`apps/web/scripts/seed-accounts.mjs` (the first-admin bootstrap, pre-dating this
work) had only the `NODE_ENV` check described above. It now calls the same
hostname guard. It was **fixed rather than superseded**: it is the only
bootstrap for the first super admin, so it has to keep working — leaving the
weak check in place would have left a live footgun pointed at production.

---

## 2. Get a Neon branch to seed

The scripts do not create the branch; they run against whatever you point them
at. Create one once, in the Neon console or CLI:

```bash
# Neon console: Branches -> New branch -> from production, name it e.g. "seed-demo"
# or, with the CLI:
neonctl branches create --name seed-demo
neonctl connection-string seed-demo        # copy this
```

A branch starts as a copy-on-write clone of production, so **delete the seeded
accounts before sharing it**, or branch from an empty database instead if the
real rows must not be present at all. Dropping the branch removes everything in
one action, which is the cheapest cleanup of all.

Then export it for the session (PowerShell: `$env:SEED_DATABASE_URL = '...'`):

```bash
export SEED_DATABASE_URL='postgresql://…@ep-your-branch-…neon.tech/neondb?sslmode=require'
```

Apply migrations to the branch before seeding:

```bash
DATABASE_URL="$SEED_DATABASE_URL" node packages/db/scripts/migrate.mjs
```

---

## 3. Seed

```bash
node apps/web/scripts/seed-demo.mjs
```

Idempotent — safe to re-run. Every row it writes has an id prefixed `seed_`;
re-running updates in place rather than duplicating, and rotates every password.

Output is a row count per group, then the path to `SEED-CREDENTIALS.md`. No
password is ever printed.

### What gets seeded

**22 accounts**, one per Bible persona and admin role:

- Artists A0 (unverified), A1 (identity), A2 (portfolio), A4 (curator verified)
- Buyers: first-time (`order_count == 0`, so escrow pre-selects per §A1) and repeat
- NRI Collector, Curator, Gallery
- **Venue Owner** × 3 — one per WaaS tier (Basic / Pro / Enterprise)
- **Wall Manager** and **Wall Consultant** — three distinct roles, per Locked
  Rules 34 and 35. A Venue Owner is not a Wall Manager is not a Wall Consultant.
- All **8 Bible admin roles**: Super Admin, Operations, Finance, Content,
  Support, Analytics, Wall Network (stored as `venue_admin`), Blockchain.
  Granting any of these also sets `user.role = 'admin'`, because the admin
  area's page gate checks that column too.

**7 artworks** — the six valid paths from §21 (§159–164), plus a blocked control:

| Path | Work | State | Proves |
|---|---|---|---|
| 1 | Monsoon Over Amber | no COA | primary listing fine without a COA (Rule 5) |
| 2 | Thar Noon | holographic COA only | holographic ≠ blockchain (Rule 7) |
| 3 | Ledger of Small Gods | blockchain, no binding | exhibition still blocked (Rule 17) |
| 4 | Blue Hour, Nahargarh | binding + blockchain, not exhibiting | exhibition is optional (Rule 16) |
| 5 | The Weaver's Arithmetic | exhibited → demand → sold | full revenue path (§159) |
| 6 | Unsold Inventory of Dreams | exhibited → rotated → returned | no commerce needed (§160) |
| — | Draft — Unverified Artist | A0 owner | primary listing **BLOCKED** (matrix row 1) |

A path is seeded by writing the rows the policy engine actually reads
(`coa_certificates`, `mint_commitments`, `art_tags`, `art_tag_scans`,
`curator_picks`) — never by setting a status field. The engine computes
eligibility itself, so the data proves the matrix rather than asserting it.

**WallOS tree**: organization → venue → building → floor → room/zone → wall →
3 slots (Rule 31). Slot **A3 is deliberately empty and still carries an active
QR** (Rule 21). All three QRs are slot-bound, never artwork-bound
(Rule 22 / Invariant 12).

**2 exhibitions**: one `published` on slot A1, one `ended` on A2. Both artworks
are B3 + P3, so each genuinely passes `canExhibit()` — the seed never creates an
exhibition the engine would refuse (Rules 17–18). Only one is active, so
Invariant 1 (one active exhibition per slot) holds.

**Demand signals** across 6 artworks, so the homepage rails render from the real
demand engine. The scores in `demand_aggregates` are **internal** (§44): no UI
was added, and nothing public should ever print the number — qualitative bands
only.

**3 orders**: one on the escrow path (held funds), one direct and completed, one
unpaid. There is no `escrow_mode` column in this schema; the presence of an
`escrow_holds` row for the sub-order *is* the escrow path (migration 0067
attaches a hold to exactly one `seller_order`).

**Provenance chains**: append-only (Invariant 7), written once in event order.

All prices are integer paise, INR, inside the §A4 range (₹500 – ₹50,00,000).

### Seeded rows are ordinary rows

No application code special-cases the `seed_` prefix. The data is editable and
deletable and flows through the same policy engine, eligibility matrix and
invariants as a real artist's work. The prefix exists only so a purge can find
it.

---

## 4. Purge

```bash
node apps/web/scripts/seed-demo.mjs --purge
```

One command, one transaction, child-before-parent. It only ever touches rows
whose id starts with `seed_`, and it reports a count per table.

It respects the database's own invariants rather than disabling them:

- **Append-only tables** (`provenance_events`, `exhibition_transitions`,
  `coa_certificates`) are removed through the **same DPDP erasure path the app's
  own "delete my account" flow uses** — `set_config('artwall.erasing_user', …)`
  per seeded user, which is the escape hatch those triggers were built with. No
  trigger is disabled.
- **Admin role grants are revoked, not deleted.** `admin_role_assignments` is a
  permanent audit record (Rule 47) whose trigger refuses DELETE, and
  `revokeAdminRole` sets `revoked_at` rather than deleting. The purge does the
  same, so the audit trail survives and the role stops being effective (every
  check filters on `revoked_at is null`).

### One thing the purge cannot remove

**`demand_signals` rows stay behind.** Its trigger (migration 0045) raises on
UPDATE and DELETE **unconditionally** — unlike the other append-only tables it
has no erasing-user hatch, and the app's own erasure path does not delete from
it either. The table also has no foreign key to `artworks`, so it is
orphan-tolerant by design.

So the purge removes the artwork and its aggregate and leaves the signal rows as
anonymous analytics — `(artwork_id, signal_type, weight)`, no personal data —
pointing at an id that no longer resolves. That is the schema's intent, not a
purge failure. Emptying them would mean disabling a production invariant, which
the script will not do. If a truly spotless database is needed, **drop the Neon
branch** instead; that is the real one-command cleanup.

---

## 5. Verify a seeded database

```bash
# the six paths and their trust dimensions
psql "$SEED_DATABASE_URL" -c "
select a.id,
  (select count(*) from coa_certificates c where c.artwork_id=a.id and c.status='issued') coa,
  (select count(*) from mint_commitments m where m.artwork_id=a.id and m.status='minted') anchored,
  (select count(*) from art_tags t where t.artwork_id=a.id and t.bound_at is not null) bound,
  a.commerce_status, a.exhibition_status
from artworks a where a.id like 'seed_%' order by a.id;"

# the 8 admin roles, each also carrying user.role='admin'
psql "$SEED_DATABASE_URL" -c "
select r.name, u.role, u.email from admin_role_assignments ara
join admin_roles r on r.id=ara.role_id join \"user\" u on u.id=ara.user_id
where ara.id like 'seed_%' and ara.revoked_at is null order by r.name;"

# Invariant 1: at most one active exhibition
psql "$SEED_DATABASE_URL" -c "
select status, count(*) from exhibitions where id like 'seed_%' group by status;"
```

---

## 6. Credentials

`SEED-CREDENTIALS.md` (repo root, gitignored via `SEED-CREDENTIALS*.md`) is
rewritten on every seed run. It is a table of role, persona, email, password,
what the account is for, and which screens it proves out.

Every account has its **own random password**; there is no shared literal. A
re-seed rotates all of them. Never commit the file, never paste its contents
into an issue or a chat.
