-- 0053: exhibition_transitions must allow DELETE during DPDP erasure of the
-- exhibition's owner (BE-3.08 wiring surfaced this — see data-rights.ts's
-- eraseUserIn, which deletes the exhibitions row itself).
--
-- 0051's own trigger (exhibition_transitions_append_only) always raises, with
-- no erasure exception, so `delete from exhibitions where user_id = $1`
-- failed with a FK violation the moment any real exhibition had a
-- transition row (every exhibition does, from BE-3.08's own wiring). The
-- existing shared artwall_append_only() (0028) can't be reused as-is: its
-- 'erasure' del_rule checks the row's own user_id or an artworks FK, and
-- exhibition_transitions has neither — ownership is one hop away, through
-- exhibitions.user_id. So this is its own small trigger function, same
-- erasure-exception shape as the shared one.

begin;

create or replace function exhibition_transitions_append_only() returns trigger
language plpgsql as $$
declare
  erasing text;
begin
  if tg_op = 'DELETE' then
    erasing := nullif(current_setting('artwall.erasing_user', true), '');
    if erasing is not null and exists (
      select 1 from exhibitions e where e.id = old.exhibition_id and e.user_id = erasing
    ) then
      return old;
    end if;
  end if;

  raise exception 'exhibition_transitions is append-only: % not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

commit;
