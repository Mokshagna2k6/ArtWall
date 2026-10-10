-- 0064: one artwork per booked slot (HANDOFF §4 multi-artwork-per-slot).
--
-- Additive and backwards compatible: pw_bookings.artwork_id stays as the
-- "primary" artwork (kept in sync by the app with the first slot's artwork) so
-- any reader not yet moved to the slot level keeps working.

alter table pw_booking_slots add column if not exists artwork_id text;

do $$ begin
  alter table pw_booking_slots
    add constraint pw_booking_slots_artwork_fk
    foreign key (artwork_id) references artworks(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Backfill: a legacy booking's single artwork goes on its first slot (stable
-- order by slot id). Only rows with no slot artwork yet, so re-runs are no-ops.
update pw_booking_slots bs
set artwork_id = b.artwork_id
from pw_bookings b
where b.id = bs.booking_id
  and b.artwork_id is not null
  and bs.artwork_id is null
  and bs.slot_id = (
    select min(x.slot_id) from pw_booking_slots x where x.booking_id = b.id
  )
  and exists (select 1 from artworks a where a.id = b.artwork_id)
  -- re-run safe: never put the same work on a second slot of the booking
  and not exists (
    select 1 from pw_booking_slots y
    where y.booking_id = b.id and y.artwork_id = b.artwork_id
  );

-- One physical work hangs in one slot of a booking.
create unique index if not exists pw_booking_slots_booking_artwork_uq
  on pw_booking_slots (booking_id, artwork_id) where artwork_id is not null;

create index if not exists pw_booking_slots_artwork_idx
  on pw_booking_slots (artwork_id) where artwork_id is not null;
