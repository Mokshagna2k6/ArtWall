-- 0079: split exhibitions into PHYSICAL and VIRTUAL, and link physical ones
-- to a WallOS slot.
--
-- ## The product rule this encodes
--
-- Physical exhibition requires active physical binding AND approved blockchain
-- provenance (Bible rules 17-18). Virtual exhibition requires NEITHER — no
-- crate ships, nothing is installed, no QR is bound, so demanding a physical
-- binding would make the 3D building unusable for exactly the works it exists
-- to show (Bible §15/§53).
--
-- Both halves of that rule are ALREADY enforced in code and were before this
-- migration:
--   - physical: `publishExhibition` runs `canExhibit` over every member
--     artwork's five trust dimensions and refuses the publish otherwise
--     (features/exhibitions/actions.ts).
--   - virtual: `placeArtworkOnSlot` deliberately does NOT call `canExhibit`,
--     and says why in its header (features/wallos/virtual-wall/actions.ts).
--
-- What was missing is that the `exhibitions` table could not SAY which kind a
-- row is. Everything in it was implicitly physical, while the virtual surface
-- lived entirely in `virtual_wall_placements` with no row here at all. A
-- reader of the table could not tell which gate applied, and nothing stopped
-- a future caller from publishing a virtual show through the physical path.
-- `kind` makes the distinction explicit and checkable.
--
-- ## Why `wall_slot_id` is nullable
--
-- Bible rule 23: "Artwork-to-slot mapping occurs through exhibition/placement
-- records" — the slot link belongs here, not as a column on the artwork. But
-- it cannot be NOT NULL:
--   - a virtual exhibition has no physical slot at all;
--   - a physical exhibition is created before a slot is matched to it
--     (lifecycle stages REQUESTED -> ELIGIBILITY_APPROVED -> MATCHED, Bible
--     §41), so the column is empty for the first three stages of its life.
-- The partial CHECK below enforces the part that IS invariant: a virtual
-- exhibition may never hold a physical slot.
--
-- ## Existing rows
--
-- All existing rows become 'physical'. That is correct and not a guess: the
-- virtual surface has never written to this table (it uses
-- `virtual_wall_placements`, migration 0073), so every row here was created
-- through the physical path and was already gated by `canExhibit`.
--
-- Purely additive: two columns, one CHECK, one index. Nothing dropped or
-- retyped.

begin;

-- ---------------------------------------------------------------------------
-- 1. kind
-- ---------------------------------------------------------------------------
-- 'physical' — occupies a real wall slot. Gated on binding + blockchain.
-- 'virtual'  — lives only in the 3D building. No physical gate.
alter table exhibitions
  add column if not exists kind text not null default 'physical';

alter table exhibitions
  drop constraint if exists exhibitions_kind_check;
alter table exhibitions
  add constraint exhibitions_kind_check check (kind in ('physical', 'virtual'));

-- ---------------------------------------------------------------------------
-- 2. wall_slot_id
-- ---------------------------------------------------------------------------
-- References the WallOS hierarchy leaf (`slots`), the same table
-- `virtual_wall_placements.slot_id` points at, so a slot has one identity
-- across both surfaces (Bible §30-34: slot is the commercial unit).
--
-- `on delete set null` rather than cascade: decommissioning a slot must not
-- silently delete the exhibition's historical record. Invariant 13 keeps the
-- artwork-to-slot mapping in this row; losing the row would lose the history.
alter table exhibitions
  add column if not exists wall_slot_id text
  references slots(id) on delete set null;

-- A virtual exhibition has no physical slot, ever. The converse is NOT
-- asserted: a physical exhibition legitimately has no slot until it reaches
-- the MATCHED stage.
alter table exhibitions
  drop constraint if exists exhibitions_virtual_has_no_slot;
alter table exhibitions
  add constraint exhibitions_virtual_has_no_slot
  check (kind <> 'virtual' or wall_slot_id is null);

-- "What is showing on this slot" and "list the virtual shows" are the two
-- reads this migration exists to make possible.
create index if not exists exhibitions_wall_slot_idx
  on exhibitions (wall_slot_id) where wall_slot_id is not null;
create index if not exists exhibitions_kind_idx
  on exhibitions (kind);

commit;
