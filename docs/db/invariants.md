# Database invariants

Rules the **database** enforces, so no write path (app code, a script, a psql
session, a future feature) can break them. App-side checks still exist for
friendly errors; these are the backstop.

The Product Bible's §69 text is not in this repo. The 15 rules below are the
Phase 2 database task list (DB-2.01 – 2.16) as implemented; each has a test in
`src/lib/db/__tests__/invariants.db.test.ts` (test id = its `describe` name)
that attempts the violation with raw SQL and asserts the SQLSTATE the database
answers with.

| #  | Invariant | Enforced by | Migration | Test id (`describe`) | Rejected with |
| -- | --------- | ----------- | --------- | -------------------- | ------------- |
| 1  | `pw_ledger` is append-only: no UPDATE, DELETE, TRUNCATE. Corrections are new rows. | trigger `pw_ledger_append_only` + REVOKE from `artwall_app` | 0028, 0035 | `DB-2.01 pw_ledger is append-only` | 23001 (trigger), 42501 (privilege) |
| 2  | `provenance_events` is append-only. DELETE only inside a DPDP erasure of the artwork's owner. | trigger `provenance_events_append_only` + REVOKE UPDATE | 0028, 0035 | `DB-2.02 provenance_events is append-only` | 23001, 42501 |
| 3  | Every owner an artwork has had is recorded, and the record cannot be rewritten. | `artwork_ownership_history`, written by trigger `artworks_record_history`; append-only trigger | 0028 | `DB-2.03 / DB-2.04 ownership and price history` | 23001, 42501 |
| 4  | Every price an artwork has had is recorded, and cannot be rewritten. | `artwork_price_history`, same trigger | 0028 | same | 23001, 42501 |
| 5  | `pw_audit_log` is append-only. The one allowed UPDATE is `actor_label`, only while erasing that actor. | trigger `pw_audit_log_guard` + REVOKE, column GRANT on `actor_label` | 0028, 0035 | `DB-2.05 pw_audit_log is append-only` | 23001, 42501 |
| 6  | Condition-report evidence (`pw_condition_photos`, `pw_damage_records`) is immutable; `resolved_at` is set once. | triggers + REVOKE | 0028, 0035 | `condition reports are append-only` | 23001, 42501 |
| 7  | A certificate's content is fixed once it leaves `draft`; `issued_at` fixed once set; a revoked certificate is frozen; only drafts may be deleted (except erasure). | trigger `coa_certificates_guard` | 0029 | `DB-2.06 issued certificate content is immutable` | 23001, 23514 |
| 8  | Certificate status moves only along the mint state machine, and each status carries its facts (`minted` ⇒ txHash, tokenId, chainId, contractAddr, mintedAt). | trigger + CHECKs `coa_certificates_{issued,revoked,minting,minted}_check`, `mint_commitments_minted_check` | 0029 | `DB-2.14 mint state transitions` | 23514 |
| 9  | A mint voucher nonce is used once, ever; one certificate per (chain, contract, token). | unique indexes `coa_certificates_mint_nonce_uidx`, `coa_certificates_token_uidx` | 0029 | `DB-2.15 a mint voucher nonce is issued once` | 23505 |
| 10 | Money is integer paise, never negative. No numeric/float money column. | `integer`/`bigint` types + `CHECK (x >= 0)` on every `*_paise` column | 0017, 0018, 0033, earlier | `DB-2.08 money is integer paise, never negative` | 23514 |
| 11 | No two live bookings (held, paid, completed) occupy one wall slot on overlapping dates. | exclusion constraint `pw_slot_occupancy_no_overlap` (gist) on a trigger-maintained projection | 0030 | `DB-2.09 no overlapping live bookings on a slot` (incl. two concurrent transactions) | 23P01 |
| 12 | Reserved install windows never exceed `pw_settings.install_capacity` at any moment. | trigger `pw_install_windows_capacity` under an advisory xact lock | 0031 | `DB-2.10 install capacity holds under concurrency` | 23514 |
| 13 | Every FK states its ON DELETE; financial/legal/evidential records RESTRICT deletion of what they point at. | explicit FKs | 0032 | `DB-2.11 foreign keys state their ON DELETE` + `dpdp.db.test.ts` (erasure end to end) | 23503 |
| 14 | A tag UID is registered once, case-insensitively. | `art_tags_tag_uid_key` + `art_tags_tag_uid_ci_uidx` on `lower(tag_uid)` | 0013, 0033 | `DB-2.16 tag uid and binding` | 23505 |
| 15 | A tag has at most one binding, and a binding stamp implies an artwork. | the binding is a column on the tag's own row (one per tag by construction) + CHECK `art_tags_binding_check` + FK RESTRICT on the artwork | 0032, 0033 | same | 23514, 23503 |

DB-2.12 (indexes) is covered by `DB-2.12 marketplace query uses its indexes`:
it loads 30k artworks in a rolled-back transaction, ANALYZEs, and asserts the
default planner uses `artworks_marketplace_recent_idx`,
`artworks_market_category_price_idx`, `artworks_market_price_idx` and the
`search_tsv` GIN index `artworks_search_idx`, with no seq scan on artworks.
(The marketplace's free-text `q` filter is `ILIKE '%…%'`, which no btree or
the tsvector index serves; it filters the rows the partial indexes return.)
DB-2.13 (re-runnable migrations) by `scripts/migrations-check.mjs`.

## The two layers of append-only

1. **Guard triggers** fire for every role, the owner included. Only the table
   owner can get past them (`ALTER TABLE … DISABLE TRIGGER`), which is what the
   test purge does inside its own transaction (`src/test/fixtures.ts`).
2. **REVOKE** binds only a role that is not the owner. On Neon `neondb_owner`
   is in `neon_superuser` → `pg_write_all_data`, which grants
   INSERT/UPDATE/DELETE on every table regardless of table ACLs; Neon manages
   that membership. So revoking UPDATE/DELETE from the owner is a no-op
   (TRUNCATE is not in `pg_write_all_data`, so that revoke holds).

## DPDP erasure is the one sanctioned delete path

`eraseUserIn` (`src/features/physical-wall/data-rights.ts`) runs
`select set_config('artwall.erasing_user', <user id>, true)` first. The setting
is transaction-local, and the triggers honour it only for rows belonging to
that user: provenance and certificates of their artworks may be deleted, and
their audit rows may have `actor_label` pseudonymised. Nothing else changes.

Users are never deleted, they become tombstones, so every FK to `"user"` is
RESTRICT (retained records keep pointing at the tombstone), except sign-in and
studio CRM rows (`session`, `account`, `contacts`, …), which CASCADE.
Artwork children: link rows CASCADE (`exhibition_artworks`, `curator_picks`,
history tables); records RESTRICT (`editions`, `coa_certificates`,
`provenance_events`, `mint_commitments`, `art_tags`), and erasure deletes or
unbinds them first, children first; `pw_damage_records.artwork_id`,
`pw_bookings.artwork_id` SET NULL (the booking and the damage evidence outlive
the artwork).

## Application role

`artwall_app` (0035) is a NOLOGIN group role with DML on every table except
what the rules above forbid. **Today the app connects as `neondb_owner`**, so
only the trigger layer is live. To make the REVOKE layer live too:

```sql
create role artwall_web login password '…' in role artwall_app;
```

then point `DATABASE_URL` at `artwall_web`, and keep the owner URL for
`scripts/migrate.mjs` only. The whole DB suite passes as that role:

```
DB_TEST_ROLE=artwall_app pnpm test:db
```

A new append-only table must be added to the REVOKE list in 0035 (or a later
migration): the default privileges grant `artwall_app` UPDATE/DELETE on every
new table.

## Checking migrations (DB-2.13)

```
node --env-file=.env scripts/migrations-check.mjs
```

Creates a throwaway database, applies every migration, fingerprints the
catalog (columns, constraints, indexes, triggers, grants), applies every
migration a second time, compares, drops the database. Needs a role that can
`CREATE DATABASE` (Neon's owner can). Each file runs in one transaction, as
`scripts/migrate.mjs` does.

## Backup and point-in-time restore (DB-2.17)

Neon keeps a write-ahead-log history for every branch (the "restore window";
the length depends on the plan, check Project settings → Storage). Any moment
inside the window can be restored. Nothing needs to be scheduled for this.

**Restore drill (non-destructive, do this first):** make a branch as of the
moment before the incident, and check it.

- Console: Branches → the production branch → *Create branch* → *Past data*,
  pick the timestamp.
- CLI: `neonctl branches create --project-id <project> --name restore-check --parent <prod-branch> --parent-timestamp 2026-09-29T10:00:00Z`
- API: `POST /api/v2/projects/<project>/branches` with
  `{"branch": {"parent_id": "<prod-branch-id>", "parent_timestamp": "2026-09-29T10:00:00Z", "name": "restore-check"}}`
  and `{"endpoints": [{"type": "read_write"}]}` to get a connection string.

Connect to the branch and confirm the data is right (e.g. the ledger sum and
the latest invoice number match what you expect for that moment).

**Restore in place:** Console → Branches → production branch → *Restore* →
pick the timestamp (or restore from the checked branch). Neon keeps the
pre-restore state as a backup branch (`<branch>_old_<timestamp>`), so a restore
can itself be undone. API: `POST /api/v2/projects/<project>/branches/<prod-branch-id>/restore`
with `{"source_branch_id": "<prod-branch-id>", "source_timestamp": "…", "preserve_under_name": "pre-restore-<date>"}`.
The connection string does not change; connections drop once during the swap.

After a restore: re-run `scripts/migrate.mjs` (a restore to before a migration
un-applies it, and `_migrations` is restored with it), then reconcile anything
external that happened after the restore point: Razorpay payments/refunds
(`processOpenRefunds`, the payment webhook's replay), mints on-chain
(`/api/blockchain/cron/reconcile-mints`), Cloudinary deletions
(`pw_asset_deletions`).

**Beyond the restore window:** a nightly logical dump is the long-term copy
(the GST records must be kept 72 months):
`pg_dump --format=custom --no-owner "$DATABASE_URL_UNPOOLED" > artwall-$(date +%F).dump`,
stored off Neon; restore with `pg_restore --no-owner -d <empty db> artwall-….dump`.

**What has been exercised (2026-09-30):** the logical dump path, end to end.
`pg_dump --format=custom --no-owner` of the dev branch (PG 17.11) from a
`postgres:17` container, `pg_restore --no-owner --no-acl` into an empty
database: no restore errors; row counts and money sums (ledger, payments),
users, artworks, provenance, audit, certificates, ownership history,
`_migrations`, 20 guard triggers and 276 constraints identical to the source
snapshot; and the append-only triggers fire in the restored copy (an UPDATE
on `pw_ledger` and a DELETE on `provenance_events` were refused).
`--no-acl` drops the `artwall_app` grants; re-run 0035 after restoring into a
fresh server.

Not yet exercised: the Neon branch / restore-in-place drill. No `NEON_API_KEY`
(or neonctl login) is available here, so it has not been run against a real
branch. Run the non-destructive branch drill above once a key exists.
