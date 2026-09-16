-- Backfill the search_tsv column added in 0009 so the GIN index is populated.
-- No trigger (the migration runner cannot handle dollar-quoted PL/pgSQL);
-- the application sets search_tsv on insert/update instead.

update artworks
set search_tsv = to_tsvector('english',
  coalesce(title, '') || ' ' ||
  coalesce(medium, '') || ' ' ||
  coalesce(description, ''))
where search_tsv is null
