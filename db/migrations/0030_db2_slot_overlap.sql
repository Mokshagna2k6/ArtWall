-- 0030: no two live bookings on one slot over overlapping dates (DB-2.09).
--
-- reserveBooking / settleBooking check this under row locks, but a check in
-- the app is only as good as every future write path remembering it. The
-- exclusion constraint makes an overlap impossible to commit.
--
-- The dates live on pw_bookings and the slots on pw_booking_slots, and an
-- exclusion constraint needs both in one row, so pw_slot_occupancy is a
-- trigger-maintained projection: one row per (booking, slot) while the booking
-- is live (held, paid, completed), none otherwise. Nothing writes it directly.
--
-- Not covered here, still app-side: pw_settings.buffer_days (a tunable gap
-- between bookings cannot be a constraint), and a hold whose timer lapsed but
-- has not been swept yet still counts as live here, while the app treats it as
-- gone. reserveBooking sweeps lapsed holds first, so the two agree in practice.

create extension if not exists btree_gist;

create table if not exists pw_slot_occupancy (
  booking_id text      not null,
  slot_id    text      not null,
  period     daterange not null,
  primary key (booking_id, slot_id),
  constraint pw_slot_occupancy_booking_slot_fkey foreign key (booking_id, slot_id)
    references pw_booking_slots (booking_id, slot_id) on delete cascade on update cascade,
  constraint pw_slot_occupancy_no_overlap exclude using gist (slot_id with =, period with &&)
);

create or replace function pw_booking_is_live(status text) returns boolean
language sql immutable as $$
  select status in ('held', 'paid', 'completed')
$$;

-- A slot added to a live booking occupies it.
create or replace function pw_booking_slots_occupy() returns trigger
language plpgsql as $$
begin
  insert into pw_slot_occupancy (booking_id, slot_id, period)
  select new.booking_id, new.slot_id, daterange(b.start_date, b.end_date, '[]')
  from pw_bookings b
  where b.id = new.booking_id and pw_booking_is_live(b.status);
  return null;
end $$;

create or replace trigger pw_booking_slots_occupy
  after insert on pw_booking_slots
  for each row execute function pw_booking_slots_occupy();

-- A booking changing status or dates re-derives its occupancy. expired -> paid
-- (a late capture) re-occupies, and fails if someone else took the dates.
create or replace function pw_bookings_sync_occupancy() returns trigger
language plpgsql as $$
begin
  delete from pw_slot_occupancy where booking_id = new.id;
  if pw_booking_is_live(new.status) then
    insert into pw_slot_occupancy (booking_id, slot_id, period)
    select bs.booking_id, bs.slot_id, daterange(new.start_date, new.end_date, '[]')
    from pw_booking_slots bs
    where bs.booking_id = new.id;
  end if;
  return null;
end $$;

create or replace trigger pw_bookings_sync_occupancy
  after update of status, start_date, end_date on pw_bookings
  for each row
  when (old.status is distinct from new.status
        or old.start_date is distinct from new.start_date
        or old.end_date is distinct from new.end_date)
  execute function pw_bookings_sync_occupancy();

-- Backfill live bookings. Fails loudly if the data already holds an overlap.
insert into pw_slot_occupancy (booking_id, slot_id, period)
select bs.booking_id, bs.slot_id, daterange(b.start_date, b.end_date, '[]')
from pw_booking_slots bs
join pw_bookings b on b.id = bs.booking_id
where pw_booking_is_live(b.status)
on conflict (booking_id, slot_id) do nothing;
