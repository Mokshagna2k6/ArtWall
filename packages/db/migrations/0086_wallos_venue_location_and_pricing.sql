-- 0086: what a Wall Manager actually manages — where a venue is, how big a
-- wall is, and what a slot costs.
--
-- Bible §13/§35 + Locked Rules 31-35 describe the WallOS hierarchy
-- (organizations -> venues -> buildings -> floors -> rooms_zones -> walls ->
-- slots), and 0050 created every one of those tables. But it created them with
-- `name` and nothing else. The consequence shows up the moment anyone tries to
-- use them for the thing they exist for: an artist looking for a wall cannot
-- filter by city, because no row anywhere records a city; and cannot compare
-- two walls, because no row records a price or a size.
--
-- So this migration adds the attributes, on the table that owns each one:
--
--  * LOCATION lives on `venues`. A venue is the real-world place with a street
--    address ("Third Wave Coffee, Indiranagar"); its buildings are structures
--    within it. Putting city on `buildings` would duplicate it across every
--    building of a multi-building venue and let two buildings of one venue
--    disagree about what city they are in.
--  * SIZE lives on `walls`, in centimetres. Integers, not a decimal: wall
--    measurements are taken to the nearest cm and a float invites 299.99999.
--  * PRICE lives on `slots`, in integer paise, matching every other money
--    column in this schema (pw_bookings, orders, offers). Nullable means "not
--    for rent" rather than "free" — a slot in a private office is listed in
--    the hierarchy but is not purchasable, and 0 would make it look free.
--
-- `venue_type` is constrained rather than free text so the artist-facing
-- filter has a fixed set to offer. The list is what the Platter partnership
-- spec names (cafe, restaurant, hotel) plus the three other venue kinds
-- already discussed for the pilot; a new kind is one `alter ... check`.
--
-- Purely additive. Every column is nullable or defaulted, so existing rows
-- stay valid and nothing that reads these tables today changes behaviour.

begin;

alter table venues
  add column if not exists venue_type   text,
  add column if not exists address_line text,
  add column if not exists city         text,
  add column if not exists state        text,
  add column if not exists pincode      text,
  -- Does this venue appear in the artist-facing wall search? Default FALSE:
  -- a venue is created before it is ready to take bookings, and a half-set-up
  -- venue appearing in search is worse than it appearing late.
  add column if not exists listed       boolean not null default false,
  add column if not exists description  text;

alter table venues drop constraint if exists venues_venue_type_check;
alter table venues add constraint venues_venue_type_check
  check (venue_type is null or venue_type in
    ('cafe', 'restaurant', 'hotel', 'gallery', 'office', 'coworking', 'retail'));

-- The artist-facing filter is "walls in this city, of this kind". Both
-- columns, and only listed venues, so the index serves the query as written.
create index if not exists venues_city_idx
  on venues (city, venue_type) where listed;

alter table walls
  add column if not exists width_cm  integer check (width_cm  is null or width_cm  > 0),
  add column if not exists height_cm integer check (height_cm is null or height_cm > 0),
  -- Free text: "north-facing, behind the counter, lit by a window". A Wall
  -- Manager's note to the artist about what hanging here is actually like.
  add column if not exists notes     text;

alter table slots
  add column if not exists price_paise      integer
    check (price_paise is null or price_paise >= 0),
  -- How long one booking of this slot runs. The pilot sells monthly slots;
  -- a venue that wants fortnightly rotation sets 14.
  add column if not exists period_days      integer not null default 30
    check (period_days > 0),
  add column if not exists width_cm         integer check (width_cm  is null or width_cm  > 0),
  add column if not exists height_cm        integer check (height_cm is null or height_cm > 0);

comment on column venues.listed is
  'Whether this venue appears in the artist-facing wall search. A Wall Manager sets it once the venue has walls, sizes and prices filled in.';
comment on column slots.price_paise is
  'Integer paise for one booking period of this slot. NULL = not for rent (listed in the hierarchy, not purchasable); 0 would wrongly read as free.';

commit;
