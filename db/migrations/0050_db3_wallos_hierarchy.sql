-- 0050: WallOS hierarchy (DB-3.06, DB-3.07).
--
-- organizations -> venues -> buildings -> floors -> rooms_zones -> walls -> slots,
-- a parallel structure to the existing flat pw_grid_config/pw_slots tables, not a
-- replacement of them. pw_bookings and pw_booking_slots are untouched by this
-- migration — a booking still references pw_slots.id exactly as it always has
-- (pw_booking_slots.slot_id -> pw_slots.id), so no existing booking's slot
-- reference can be affected by anything below. 23 call sites across
-- src/features/physical-wall/ were read before writing this migration; every
-- one uses an explicit column list (never `select *`) against pw_slots/
-- pw_bookings and explicit column lists on every insert, so new nullable
-- columns and new sibling tables are invisible to all of them.
--
-- The bridge: pw_slots gains a nullable `wallos_slot_id` FK to the new
-- `slots` table (this migration's hierarchy leaf), rather than pw_slots being
-- renamed or replaced. Every existing pw_slots row is backfilled to point at
-- a corresponding new `slots` row, itself hung under exactly one default
-- organization/venue/building/floor/room_zone/wall, per DB-3.07's own
-- wording ("under a default organization, venue and building"). New slots
-- created in the hierarchy also carry `on_chain_slot_id` (DB-3.06), which
-- pw_slots has no equivalent of today.

begin;

-- ── Hierarchy tables ────────────────────────────────────────────────────────

create table if not exists organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists venues (
  id text primary key,
  organization_id text not null references organizations (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venues_org_idx on venues (organization_id);

create table if not exists buildings (
  id text primary key,
  venue_id text not null references venues (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists buildings_venue_idx on buildings (venue_id);

create table if not exists floors (
  id text primary key,
  building_id text not null references buildings (id) on delete restrict,
  name text not null,
  level integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists floors_building_idx on floors (building_id);

create table if not exists rooms_zones (
  id text primary key,
  floor_id text not null references floors (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_zones_floor_idx on rooms_zones (floor_id);

create table if not exists walls (
  id text primary key,
  room_zone_id text not null references rooms_zones (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists walls_room_zone_idx on walls (room_zone_id);

-- The hierarchy's own leaf. Deliberately not the same table as pw_slots: a
-- wholesale rename/migration of pw_slots would touch every one of the 23
-- callers in one diff. This is the smaller, safer shape — pw_slots keeps
-- being the table every existing caller reads and writes, and gains a
-- pointer into this one.
create table if not exists slots (
  id text primary key,
  wall_id text not null references walls (id) on delete restrict,
  label text not null,
  on_chain_slot_id text,
  -- Nullable, one-to-one back-reference to the flat table this slot was
  -- migrated from. Null for a slot created directly in the hierarchy by
  -- code that does not yet exist.
  pw_slot_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists slots_wall_idx on slots (wall_id);
create unique index if not exists slots_pw_slot_idx on slots (pw_slot_id) where pw_slot_id is not null;

-- ── The bridge column on the existing flat table ───────────────────────────

alter table pw_slots add column if not exists wallos_slot_id text;

alter table pw_slots drop constraint if exists pw_slots_wallos_slot_id_fkey;
alter table pw_slots add constraint pw_slots_wallos_slot_id_fkey
  foreign key (wallos_slot_id) references slots (id) on delete restrict;

create unique index if not exists pw_slots_wallos_slot_idx on pw_slots (wallos_slot_id) where wallos_slot_id is not null;

-- ── Seed exactly one default organization, venue and building ─────────────
-- (DB-3.07's own wording), plus the floor/zone/wall needed to reach a slot.

insert into organizations (id, name) values
  ('org_default', 'ArtWall')
on conflict (id) do nothing;

insert into venues (id, organization_id, name) values
  ('venue_default', 'org_default', 'Ric Platter')
on conflict (id) do nothing;

insert into buildings (id, venue_id, name) values
  ('building_default', 'venue_default', 'Main Building')
on conflict (id) do nothing;

insert into floors (id, building_id, name, level) values
  ('floor_default', 'building_default', 'Ground Floor', 0)
on conflict (id) do nothing;

insert into rooms_zones (id, floor_id, name) values
  ('zone_default', 'floor_default', 'Main Hall')
on conflict (id) do nothing;

insert into walls (id, room_zone_id, name) values
  ('wall_default', 'zone_default', 'Physical Wall')
on conflict (id) do nothing;

-- ── Migrate every existing flat slot into the hierarchy ────────────────────
-- One `slots` row per existing `pw_slots` row, all hung off wall_default,
-- id derived deterministically from the source row so this is safely
-- re-runnable. pw_slots.id is never changed, so pw_booking_slots.slot_id
-- (and therefore every booking's slot reference) keeps resolving exactly as
-- it did before this migration ran.
insert into slots (id, wall_id, label, pw_slot_id)
select 'wos_' || s.id, 'wall_default', s.label, s.id
from pw_slots s
where s.wallos_slot_id is null
on conflict (id) do nothing;

update pw_slots s
set wallos_slot_id = 'wos_' || s.id
where s.wallos_slot_id is null;

commit;
