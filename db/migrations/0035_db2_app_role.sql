-- 0035: artwall_app, the least-privilege role the application should run as.
--
-- Why this exists: 0028 revoked UPDATE/DELETE on the append-only tables from
-- the owner, and on Neon that is a no-op. neondb_owner is a member of
-- neon_superuser, which is a member of pg_write_all_data, and that predefined
-- role grants INSERT/UPDATE/DELETE on every table regardless of table ACLs.
-- (TRUNCATE is not part of it, so those revokes do hold.) Neon manages that
-- membership; it cannot be removed. The only role a REVOKE can bind is one
-- that is not neondb_owner.
--
-- So: artwall_app gets DML on every table except what the invariants forbid.
-- It is NOLOGIN, a group role; production logs in as a member of it (see
-- docs/db/invariants.md, "Application role"). Until DATABASE_URL points at
-- such a login, the guard triggers are what enforce append-only; they fire
-- for every role, the owner included, and only the owner can disable them.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'artwall_app') then
    create role artwall_app nologin;
  end if;
end $$;

-- The owner may SET ROLE artwall_app (tests, ops checks) without inheriting it.
grant artwall_app to current_user with inherit false, set true;

grant usage on schema public to artwall_app;
grant select, insert, update, delete on all tables in schema public to artwall_app;
grant usage, select on all sequences in schema public to artwall_app;
alter default privileges in schema public grant select, insert, update, delete on tables to artwall_app;
alter default privileges in schema public grant usage, select on sequences to artwall_app;

do $$
begin
  if to_regclass('_migrations') is not null then  -- created by scripts/migrate.mjs, not by a migration
    revoke all on _migrations from artwall_app;
  end if;
end $$;

-- Append-only (0028). TRUNCATE was never granted. A new append-only table must be added here: the
-- default privileges above grant it UPDATE/DELETE.
revoke update, delete on pw_ledger from artwall_app;
revoke update, delete on pw_condition_photos from artwall_app;
revoke update on provenance_events from artwall_app;
revoke update on artwork_ownership_history from artwall_app;
revoke update on artwork_price_history from artwall_app;

revoke update, delete on pw_audit_log from artwall_app;
grant update (actor_label) on pw_audit_log to artwall_app;

revoke update, delete on pw_damage_records from artwall_app;
grant update (artwork_id, resolved_at) on pw_damage_records to artwall_app;

