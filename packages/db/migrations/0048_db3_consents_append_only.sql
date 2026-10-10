-- 0048: pw_consents append-only, enforced (DB-3.12).
--
-- pw_consents (0008) already has the per-purpose granted_at/withdrawn_at
-- shape DB-3.12 asks for, but nothing stopped a row's granted/purpose/
-- user_id from being corrected in place. Two live callers
-- (src/features/physical-wall/actions/account.ts, data-rights.ts) withdraw
-- consent via `update pw_consents set withdrawn_at = now() where ...
-- withdrawn_at is null` — a single-column close-out, not a correction. That
-- is the same "immutable except the one closing-out column" shape this
-- branch already uses for commission_policy_versions.effective_to, so the
-- trigger below permits exactly that one column to change and rejects
-- everything else (including delete), rather than redesigning the table
-- into separate grant/withdrawal tables and rewriting both live call sites.

begin;

create or replace function pw_consents_append_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'pw_consents is append-only: delete not permitted' using errcode = 'restrict_violation';
  end if;
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.visitor_id is distinct from old.visitor_id
    or new.purpose is distinct from old.purpose
    or new.granted is distinct from old.granted
    or new.notice_version is distinct from old.notice_version
    or new.granted_at is distinct from old.granted_at
  then
    raise exception 'pw_consents is append-only: only withdrawn_at may be set on an existing row'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists pw_consents_no_mutate on pw_consents;
create trigger pw_consents_no_mutate
  before update or delete on pw_consents
  for each row execute function pw_consents_append_only();

commit;
