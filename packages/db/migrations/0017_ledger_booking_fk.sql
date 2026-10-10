-- 0017: pw_ledger.booking_id — a real, indexed FK from a ledger entry to the
-- booking it concerns.
--
-- Until now the only link was text inside source_ref ('booking:<id>',
-- 'refund:<id>', 'perk:<redemption id>'), which reporting cannot join or index
-- on. Revenue per booking is now:
--
--   select booking_id, sum(amount_paise) from pw_ledger
--   where type = 'revenue' and booking_id is not null group by booking_id
--
-- Null for entries not tied to a booking (manual founder entries, visitor
-- perks). on delete restrict: bookings are never deleted, and an accounting
-- row must not silently lose what it was for.

alter table pw_ledger
  add column if not exists booking_id text
  references pw_bookings(id) on delete restrict;

create index if not exists pw_ledger_booking_idx
  on pw_ledger (booking_id)
  where booking_id is not null;

-- Backfill from the system-written source_refs. Guarded (DB-2.13): 0028 makes
-- pw_ledger append-only, so on a re-run after it this is skipped. (Not a
-- privilege check: on Neon the owner keeps UPDATE through pg_write_all_data,
-- and it is the trigger that would refuse the update.)
do $$
begin
  if not exists (select 1 from pg_trigger
                 where tgname = 'pw_ledger_append_only' and tgrelid = 'pw_ledger'::regclass) then
    update pw_ledger l
    set booking_id = b.id
    from pw_bookings b
    where l.booking_id is null
      and b.id = substring(l.source_ref from '^(?:booking|refund):(.+)$');

    update pw_ledger l
    set booking_id = r.booking_ref
    from pw_perk_redemptions r
    where l.booking_id is null
      and l.source_ref = 'perk:' || r.id
      and r.booking_ref is not null;
  end if;
end $$;

-- Amounts are magnitudes; direction is carried by type (revenue | expense).
alter table pw_ledger drop constraint if exists pw_ledger_amount_check;
alter table pw_ledger add constraint pw_ledger_amount_check check (amount_paise >= 0);
