-- Backfill the search_tsv column added in 0009 so the GIN index is populated.
-- No trigger (the migration runner cannot handle dollar-quoted PL/pgSQL);
-- the application sets search_tsv on insert/update instead.
--
-- Guarded (DB-2.13): 0018 turns search_tsv into a generated column, which can
-- no longer be UPDATEd, so a re-run of this file after 0018 is a no-op.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = current_schema() and table_name = 'artworks'
               and column_name = 'search_tsv' and is_generated = 'NEVER') then
    update artworks
    set search_tsv = to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(medium, '') || ' ' ||
      coalesce(description, ''))
    where search_tsv is null;
  end if;
end $$;
