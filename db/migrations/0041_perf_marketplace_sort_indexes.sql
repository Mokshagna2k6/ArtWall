-- 0041: keyset indexes for the two marketplace sorts that still scanned (PERF-2.11).
--
-- discoverArtworks (features/marketplace/actions.ts) supports four sorts, each
-- ending in id so a keyset cursor names one exact position (0033/0029 covered
-- "recent"; price_asc rides the plain price_paise index from 0033). Missing:
-- price_desc and title. Both are partial indexes matching the same predicate
-- and column order the marketplace filter and ORDER BY already use, so a page
-- is an index range scan from the cursor, never a sort of every listing.

create index if not exists artworks_market_price_desc_idx
  on artworks (price_paise desc nulls last, id desc)
  where "isPublic" = true and status = 'available';

create index if not exists artworks_market_title_idx
  on artworks (title, id)
  where "isPublic" = true and status = 'available';
