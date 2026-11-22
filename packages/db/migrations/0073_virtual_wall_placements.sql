-- 0073: Virtual Wall placements — the artwork-to-slot mapping for the 3D building.
--
-- Bible Rule 23 / Invariant 13: an artwork is never a column on a slot; the
-- relationship IS a placement record. Rule 21: a slot may exist with no
-- artwork, so there is simply no row for an empty slot. Invariant 1 (one
-- active exhibition per slot) is enforced here by a partial unique index on
-- (slot_id) where removed_at is null — a slot can have a long history of
-- placements but at most one current one.
--
-- Rule 22 / Invariant 12 are unaffected: the slot's QR still identifies the
-- SLOT. Resolution stays `slot -> current placement -> artwork`; nothing here
-- lets a QR point at an artwork directly.
--
-- §18 (no single status field): there is no `status` column. "Currently
-- placed" is expressed by `removed_at is null`, and the removal is retained
-- rather than deleted so the placement history is append-only in spirit
-- (Rule 43 / Invariant 7 cover provenance proper; this is the wall's own log).
--
-- This is a VIRTUAL exhibition surface (Bible §15/§53), separate from the
-- physical wall network: it deliberately does NOT write pw_bookings or
-- exhibitions, and does not claim a physical binding.

create table if not exists virtual_wall_placements (
  id             text primary key,
  -- The WallOS hierarchy leaf (table `slots`, created by 0050).
  slot_id        text not null references slots (id) on delete restrict,
  artwork_id     text not null references artworks (id) on delete restrict,
  -- Who placed it. Super Admin only, enforced in the server action; kept here
  -- so the wall itself can say who hung a work without joining the audit log.
  placed_by      text references "user" (id) on delete set null,
  placed_at      timestamptz not null default now(),
  removed_by     text references "user" (id) on delete set null,
  removed_at     timestamptz
);

-- Invariant 1: at most one live placement per slot.
create unique index if not exists virtual_wall_placements_one_active_per_slot
  on virtual_wall_placements (slot_id)
  where removed_at is null;

-- An artwork hangs in at most one virtual slot at a time: the same canvas
-- cannot be on two walls of the building simultaneously.
create unique index if not exists virtual_wall_placements_one_active_per_artwork
  on virtual_wall_placements (artwork_id)
  where removed_at is null;

create index if not exists virtual_wall_placements_artwork_idx
  on virtual_wall_placements (artwork_id);
