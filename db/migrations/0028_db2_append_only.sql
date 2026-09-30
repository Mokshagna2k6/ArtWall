-- 0028: evidential tables are append-only, enforced by the database (DB-2.01 – 2.05).
--
-- Until now "append-only" was a comment and the absence of an UPDATE in the
-- app. Now a trigger refuses the write and the application role's UPDATE /
-- DELETE / TRUNCATE privileges are revoked. Invariant list: docs/db/invariants.md.
--
--   pw_ledger                  no UPDATE, no DELETE, no TRUNCATE. Corrections are new rows.
--   provenance_events          no UPDATE. DELETE only during DPDP erasure of the artwork's owner.
--   pw_audit_log               no DELETE. UPDATE only of actor_label, only during DPDP
--                              erasure of that actor (pseudonymisation, data-rights.ts).
--   pw_condition_photos        fully immutable (condition-report evidence).
--   pw_damage_records          immutable except: resolved_at may be set once, and
--                              artwork_id may be cleared by its ON DELETE SET NULL FK
--                              (erasure deletes the artwork; the damage record is kept).
--   artwork_ownership_history  NEW. One row per owner an artwork has had, written by a
--   artwork_price_history      trigger on artworks for every INSERT and every change of
--                              "userId" / price_paise. No UPDATE; rows go only with their
--                              artwork (FK cascade), never on their own.
--
-- DPDP erasure is the one sanctioned delete/redaction path. eraseUserIn runs
--   select set_config('artwall.erasing_user', <user id>, true)
-- inside its transaction; the setting is transaction-local and the triggers
-- only honour it for rows that belong to that user.
--
-- The REVOKEs below are from PUBLIC and the owner (current_user). On Neon the
-- owner's UPDATE/DELETE revokes do NOT hold: neondb_owner inherits
-- pg_write_all_data through neon_superuser (TRUNCATE revokes do hold). The
-- REVOKE that binds is on the application role artwall_app, see 0035. The
-- triggers fire for every role. Privileged maintenance (the test-suite purge)
-- is ALTER TABLE ... DISABLE TRIGGER plus a transaction-local GRANT, see
-- src/test/fixtures.ts.

create or replace function artwall_erasing_user() returns text
language sql stable as $$
  select nullif(current_setting('artwall.erasing_user', true), '')
$$;

-- Generic guard for BEFORE UPDATE / DELETE (row) and BEFORE TRUNCATE (statement).
--   tg_argv[0]  columns that may change only to NULL (ON DELETE SET NULL targets)
--   tg_argv[1]  set-once columns (NULL -> value, never changed again)
--   tg_argv[2]  delete rule: ''        never
--                            'erasure' only while erasing the row's owner
--                                      (row.user_id, or the owner of row.artwork_id)
--                            'orphan'  only once row.artwork_id no longer exists
--                                      (i.e. as part of deleting the artwork)
create or replace function artwall_append_only() returns trigger
language plpgsql as $$
declare
  may_clear text[] := coalesce(nullif(tg_argv[0], ''), '{}')::text[];
  set_once  text[] := coalesce(nullif(tg_argv[1], ''), '{}')::text[];
  del_rule  text   := coalesce(tg_argv[2], '');
  o jsonb;
  n jsonb;
  k text;
  erasing text;
begin
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    n := to_jsonb(new);
    for k in select e.key from jsonb_each(n) e where e.value is distinct from o -> e.key loop
      continue when k = any(may_clear) and n -> k = 'null'::jsonb;
      continue when k = any(set_once) and o -> k = 'null'::jsonb;
      raise exception '% is append-only: column "%" cannot be changed', tg_table_name, k
        using errcode = 'restrict_violation';
    end loop;
    return new;
  end if;

  if tg_op = 'DELETE' then
    o := to_jsonb(old);
    if del_rule = 'erasure' then
      erasing := artwall_erasing_user();
      if erasing is not null and (
           o ->> 'user_id' = erasing
           or exists (select 1 from artworks a where a.id = o ->> 'artwork_id' and a."userId" = erasing)
         ) then
        return old;
      end if;
    elsif del_rule = 'orphan' then
      if not exists (select 1 from artworks a where a.id = o ->> 'artwork_id') then
        return old;
      end if;
    end if;
  end if;

  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end $$;

-- ── pw_ledger (DB-2.01) ─────────────────────────────────────────────────────
create or replace trigger pw_ledger_append_only
  before update or delete on pw_ledger
  for each row execute function artwall_append_only();
create or replace trigger pw_ledger_no_truncate
  before truncate on pw_ledger
  for each statement execute function artwall_append_only();
revoke update, delete, truncate on pw_ledger from public, current_user;

-- ── provenance_events (DB-2.02) ─────────────────────────────────────────────
create or replace trigger provenance_events_append_only
  before update or delete on provenance_events
  for each row execute function artwall_append_only('', '', 'erasure');
create or replace trigger provenance_events_no_truncate
  before truncate on provenance_events
  for each statement execute function artwall_append_only();
-- DELETE stays granted: DPDP erasure needs it, and the trigger scopes it.
revoke update, truncate on provenance_events from public, current_user;

-- ── pw_audit_log (DB-2.05) ──────────────────────────────────────────────────
create or replace function pw_audit_log_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and old.actor_id = artwall_erasing_user()
     and (to_jsonb(new) - 'actor_label') = (to_jsonb(old) - 'actor_label') then
    return new;
  end if;
  raise exception 'pw_audit_log is append-only: % is not allowed', tg_op
    using errcode = 'restrict_violation';
end $$;

create or replace trigger pw_audit_log_append_only
  before update or delete on pw_audit_log
  for each row execute function pw_audit_log_guard();
create or replace trigger pw_audit_log_no_truncate
  before truncate on pw_audit_log
  for each statement execute function artwall_append_only();
revoke update, delete, truncate on pw_audit_log from public, current_user;
grant update (actor_label) on pw_audit_log to current_user;

-- ── Condition reports ───────────────────────────────────────────────────────
create or replace trigger pw_condition_photos_append_only
  before update or delete on pw_condition_photos
  for each row execute function artwall_append_only();
create or replace trigger pw_condition_photos_no_truncate
  before truncate on pw_condition_photos
  for each statement execute function artwall_append_only();
revoke update, delete, truncate on pw_condition_photos from public, current_user;

create or replace trigger pw_damage_records_append_only
  before update or delete on pw_damage_records
  for each row execute function artwall_append_only('{artwork_id}', '{resolved_at}');
create or replace trigger pw_damage_records_no_truncate
  before truncate on pw_damage_records
  for each statement execute function artwall_append_only();
revoke update, delete, truncate on pw_damage_records from public, current_user;
grant update (artwork_id, resolved_at) on pw_damage_records to current_user;

-- ── Ownership and price history (DB-2.03, DB-2.04) ─────────────────────────
-- artworks."userId" and artworks.price_paise hold the current value; these
-- hold every value. Written by trigger, so no write path can skip them.
create table if not exists artwork_ownership_history (
  id          bigint      generated always as identity primary key,
  artwork_id  text        not null references artworks(id) on delete cascade,
  owner_id    text        not null references "user"(id) on delete restrict,
  recorded_at timestamptz not null default now()
);
create index if not exists artwork_ownership_history_artwork_idx
  on artwork_ownership_history (artwork_id, recorded_at);
create index if not exists artwork_ownership_history_owner_idx
  on artwork_ownership_history (owner_id);

-- price_paise null = "price on request", recorded like any other price.
create table if not exists artwork_price_history (
  id          bigint      generated always as identity primary key,
  artwork_id  text        not null references artworks(id) on delete cascade,
  price_paise integer     constraint artwork_price_history_price_check
                          check (price_paise is null or price_paise >= 0),
  recorded_at timestamptz not null default now()
);
create index if not exists artwork_price_history_artwork_idx
  on artwork_price_history (artwork_id, recorded_at);

create or replace function artworks_record_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new."userId" is distinct from old."userId" then
    insert into artwork_ownership_history (artwork_id, owner_id) values (new.id, new."userId");
  end if;
  if tg_op = 'INSERT' or new.price_paise is distinct from old.price_paise then
    insert into artwork_price_history (artwork_id, price_paise) values (new.id, new.price_paise);
  end if;
  return null;
end $$;

create or replace trigger artworks_record_history
  after insert or update of "userId", price_paise on artworks
  for each row execute function artworks_record_history();

-- Backfill the current state of every existing artwork, once.
insert into artwork_ownership_history (artwork_id, owner_id, recorded_at)
select a.id, a."userId", coalesce(a."createdAt", now())
from artworks a
where not exists (select 1 from artwork_ownership_history h where h.artwork_id = a.id);

insert into artwork_price_history (artwork_id, price_paise, recorded_at)
select a.id, a.price_paise, coalesce(a."createdAt", now())
from artworks a
where not exists (select 1 from artwork_price_history h where h.artwork_id = a.id);

create or replace trigger artwork_ownership_history_append_only
  before update or delete on artwork_ownership_history
  for each row execute function artwall_append_only('', '', 'orphan');
create or replace trigger artwork_ownership_history_no_truncate
  before truncate on artwork_ownership_history
  for each statement execute function artwall_append_only();
-- DELETE stays granted: the ON DELETE CASCADE from artworks runs as this role.
revoke update, truncate on artwork_ownership_history from public, current_user;

create or replace trigger artwork_price_history_append_only
  before update or delete on artwork_price_history
  for each row execute function artwall_append_only('', '', 'orphan');
create or replace trigger artwork_price_history_no_truncate
  before truncate on artwork_price_history
  for each statement execute function artwall_append_only();
revoke update, truncate on artwork_price_history from public, current_user;
