-- 0031: install capacity enforced by the database (DB-2.10).
--
-- chooseInstallWindow (actions/ops.ts, BE-1.15) counts overlapping reserved
-- windows under pg_advisory_xact_lock(hashtext('pw_install_windows')). This
-- trigger takes the same lock and repeats the count on every write that makes
-- a window 'reserved', so any other write path is held to the same capacity.
-- Advisory xact locks are re-entrant, so the app path does not deadlock on it.
--
-- Read committed: each statement in a PL/pgSQL function takes a fresh
-- snapshot, so the count after the lock sees a competitor that committed while
-- we waited. (Under REPEATABLE READ it would not; nothing here runs at that level.)

create or replace function pw_install_windows_capacity() returns trigger
language plpgsql as $$
declare
  cap integer;
  n   integer;
begin
  if new.status <> 'reserved' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'reserved'
     and old.starts_at = new.starts_at and old.ends_at = new.ends_at then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('pw_install_windows'));

  select install_capacity into cap from pw_settings where id = 1;
  select count(*) into n
  from pw_install_windows w
  where w.status = 'reserved'
    and w.id <> new.id
    and w.starts_at < new.ends_at
    and w.ends_at > new.starts_at;

  if n >= coalesce(cap, 2) then
    raise exception 'install capacity reached: % reserved window(s) already overlap % - % (capacity %)',
      n, new.starts_at, new.ends_at, coalesce(cap, 2)
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace trigger pw_install_windows_capacity
  before insert or update of status, starts_at, ends_at on pw_install_windows
  for each row execute function pw_install_windows_capacity();
