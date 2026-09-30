-- 0018: artworks.search_tsv maintained by Postgres; price_paise sanity check.
--
-- 0009 claimed search_tsv was "maintained by trigger" but no trigger existed,
-- and 0012 only backfilled existing rows, so every artwork created afterwards
-- was invisible to full-text search (searchArtworks in
-- src/features/physical-wall/actions/search.ts filters on search_tsv @@ ...).
--
-- A STORED generated column instead of a trigger: nothing can forget to
-- maintain it, and no application write path has to know it exists.
-- Same fields as before (title, medium, description), now weighted so a title
-- hit outranks a description hit in ts_rank.

drop index if exists artworks_search_idx;
alter table artworks drop column if exists search_tsv;

alter table artworks add column search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(medium, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored;

create index artworks_search_idx on artworks using gin (search_tsv);

-- price_paise (0013) is a listing price in paise, written by createArtwork.
-- There is no earlier price column or table to backfill it from (sales.amount
-- is a deal amount, not a listing price), so existing rows stay null = "price
-- on request", which every reader already handles.
alter table artworks drop constraint if exists artworks_price_paise_check;
alter table artworks add constraint artworks_price_paise_check
  check (price_paise is null or price_paise >= 0);
