-- Artwork and selfie uploads for the wall.
--
-- Uploads publish instantly (a product decision), so `status` exists to pull a
-- tile down fast without deleting the artist's place. Hiding is reversible;
-- deleting a founding artist's row is not, and would renumber nobody but would
-- lose their history.
--
-- Cloudinary public_ids are stored alongside the URLs because deleting an asset
-- from Cloudinary requires the public_id, not the URL.

alter table waitlist_entries
  add column if not exists artwork_url        text,
  add column if not exists artwork_public_id  text,
  add column if not exists artwork_width      integer,
  add column if not exists artwork_height     integer,
  add column if not exists selfie_url         text,
  add column if not exists selfie_public_id   text,
  add column if not exists artwork_title      text,
  add column if not exists quote              text,
  add column if not exists status             text not null default 'visible'
    check (status in ('visible', 'hidden'));

-- The wall queries visible entries that actually have an image, newest first.
create index if not exists waitlist_entries_wall_idx
  on waitlist_entries (status, founder_number)
  where artwork_url is not null;

-- Name search on the wall ("find myself"). Case-insensitive prefix/substring
-- matching is served well enough by a trigram index at this scale.
create extension if not exists pg_trgm;

create index if not exists waitlist_entries_name_trgm_idx
  on waitlist_entries using gin (lower(name) gin_trgm_ops);
