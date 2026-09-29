-- 0033: money columns, tag binding, marketplace indexes (DB-2.08, DB-2.12, DB-2.16).

-- ── Money (DB-2.08) ─────────────────────────────────────────────────────────
-- Every money column is integer paise with a >= 0 check. Two were not:
--   sales.amount                 whole RUPEES (the studio CRM form), no check.
--                                Renamed to "amountPaise" and converted x100.
--   pw_agreements.total_amount_paise  had no check.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = current_schema() and table_name = 'sales' and column_name = 'amount') then
    alter table sales rename column amount to "amountPaise";
    update sales set "amountPaise" = "amountPaise" * 100 where "amountPaise" is not null;
  end if;
end $$;

alter table sales drop constraint if exists sales_amount_paise_check;
alter table sales add constraint sales_amount_paise_check
  check ("amountPaise" is null or "amountPaise" >= 0);

alter table pw_agreements drop constraint if exists pw_agreements_total_amount_paise_check;
alter table pw_agreements add constraint pw_agreements_total_amount_paise_check
  check (total_amount_paise >= 0);

-- ── Tags (DB-2.16) ──────────────────────────────────────────────────────────
-- tag_uid is already UNIQUE (art_tags_tag_uid_key, 0013), and a binding is a
-- column on the tag's own row, so one tag has at most one active binding by
-- construction. What was missing:
--   * bound_at without an artwork. createTag used to stamp bound_at on unbound
--     tags; the app now keeps them paired (art-tags/actions.ts), the DB didn't.
--   * the same physical UID registered twice in different case. NFC UIDs are
--     hex and readers disagree on case; a case-variant would be a second tag
--     for one chip, and a scan resolves to whichever matches exactly.
update art_tags set bound_at = null where artwork_id is null and bound_at is not null;

alter table art_tags drop constraint if exists art_tags_binding_check;
alter table art_tags add constraint art_tags_binding_check
  check ((artwork_id is null) = (bound_at is null));

create unique index if not exists art_tags_tag_uid_ci_uidx on art_tags (lower(tag_uid));

-- ── Marketplace indexes (DB-2.12) ───────────────────────────────────────────
-- discoverArtworks (features/marketplace/actions.ts) always filters
-- "isPublic" = true and status = 'available', then optionally category and a
-- price range, sorted by "createdAt" desc or price. Partial indexes on exactly
-- that predicate. search_tsv already has its GIN index (artworks_search_idx, 0018).
create index if not exists artworks_market_category_price_idx
  on artworks (category, price_paise)
  where "isPublic" = true and status = 'available';

create index if not exists artworks_market_price_idx
  on artworks (price_paise)
  where "isPublic" = true and status = 'available';

create index if not exists artworks_market_recent_idx
  on artworks ("createdAt" desc)
  where "isPublic" = true and status = 'available';
