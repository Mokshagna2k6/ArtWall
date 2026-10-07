-- 0057: rebuild `collections` as a real many-to-many grouping (DB-COLL.01).
--
-- The old table (0003_studio.sql) was a single generic "name + optional
-- description" bucket per user — effectively a wishlist, not a Collection.
-- This migration reshapes it to match the product model: BUYER / ARTIST /
-- CURATOR collections, each a named, sluggable, optionally-public container,
-- with membership in a separate join table (`collection_artworks`) so one
-- artwork can belong to many collections and a collection never owns the
-- artworks it lists.
--
-- Existing rows are preserved, not dropped: `name` -> `title`, `userId` ->
-- `owner_id`, and every row defaults to `type = 'BUYER'` (the closest honest
-- reading of what the old table actually was) with `visibility = 'private'`
-- so nothing that used to be private silently becomes public. A slug is
-- backfilled from the title, de-duplicated with a numeric suffix where two
-- of one owner's collections previously shared a name (the old table had no
-- unique constraint on name at all).

begin;

alter table collections rename column "userId" to owner_id;
alter table collections rename column name to title;
alter table collections rename column "createdAt" to created_at;

alter table collections
  add column if not exists type text not null default 'BUYER',
  add column if not exists thesis text,
  add column if not exists cover_artwork_id text,
  add column if not exists visibility text not null default 'private',
  add column if not exists slug text,
  add column if not exists is_featured boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table collections alter column created_at type timestamptz using created_at at time zone 'UTC';

alter table collections drop constraint if exists collections_type_check;
alter table collections add constraint collections_type_check
  check (type in ('BUYER', 'ARTIST', 'CURATOR'));

alter table collections drop constraint if exists collections_visibility_check;
alter table collections add constraint collections_visibility_check
  check (visibility in ('public', 'private'));

-- Backfill a unique-per-owner slug for every existing row (new rows generate
-- their own at insert time in src/features/collections/actions.ts).
with slugged as (
  select
    id,
    owner_id,
    trim(regexp_replace(lower(trim(title)), '[^a-z0-9]+', '-', 'g'), '-') as base
  from collections
  where slug is null
),
numbered as (
  select
    id,
    coalesce(nullif(base, ''), 'collection') as base,
    row_number() over (partition by owner_id, coalesce(nullif(base, ''), 'collection') order by id) as rn
  from slugged
)
update collections c
set slug = case when n.rn = 1 then n.base else n.base || '-' || n.rn end
from numbered n
where c.id = n.id;

update collections set slug = 'collection-' || id where slug is null or slug = '';

alter table collections alter column slug set not null;

create unique index if not exists collections_owner_slug_idx on collections (owner_id, slug);

-- At most one featured collection per owner (section 12 of the spec).
create unique index if not exists collections_one_featured_per_owner
  on collections (owner_id) where is_featured;

create index if not exists collections_type_idx on collections (type);
create index if not exists collections_visibility_idx on collections (visibility, published_at desc);

-- Membership: many-to-many, no duplicate artwork within one collection.
create table if not exists collection_artworks (
  collection_id text not null references collections (id) on delete cascade,
  artwork_id text not null references artworks (id) on delete cascade,
  "position" integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (collection_id, artwork_id)
);

create index if not exists collection_artworks_artwork_idx on collection_artworks (artwork_id);
create index if not exists collection_artworks_order_idx on collection_artworks (collection_id, "position");

commit;
