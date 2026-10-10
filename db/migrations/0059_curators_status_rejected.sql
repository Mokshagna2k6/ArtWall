-- 0059: widen curators.status to add 'rejected' for the curator self-serve
-- application + admin approval flow (src/features/curators/actions.ts).
--
-- curators.status was created in 0013 with a 3-state CHECK
-- (pending, active, suspended). 'suspended' means "was active, since
-- stopped" (suspendCurator: active -> suspended) — a different thing from
-- "a pending application was declined", which this flow now needs
-- (rejectCurator: pending -> rejected). Reusing 'suspended' for that would
-- send a false "this curator used to be active" signal, so the CHECK is
-- widened the same way 0056 widened art_tags.binding_status for a real new
-- state rather than overloading an existing one.
--
-- No backfill needed: 'rejected' is a brand new value, so nothing existing
-- moves into or out of it.

begin;

alter table curators drop constraint if exists curators_status_check;

alter table curators add constraint curators_status_check
  check (status in ('pending', 'active', 'suspended', 'rejected'));

commit;
