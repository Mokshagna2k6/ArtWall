-- 0029: keyset pagination for the marketplace (PERF-1.07).
--
-- The default "Newest" sort pages by ("createdAt" desc, id desc). This partial
-- index matches that order and the always-on marketplace filter, so each page
-- is an index range scan from the cursor instead of a sort of every listing.
create index if not exists artworks_marketplace_recent_idx
  on artworks ("createdAt" desc, id desc)
  where "isPublic" = true and status = 'available';
