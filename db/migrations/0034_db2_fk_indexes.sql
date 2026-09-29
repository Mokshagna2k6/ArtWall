-- 0034: indexes for foreign-key columns that queries actually filter or join on (DB-2.12).
--
-- Found with: FK constraints whose columns are not the leading columns of any
-- index. Left unindexed on purpose: "who did it" columns on user (created_by,
-- reviewer_id, ...) that no query filters on and whose parent is never deleted
-- (users are tombstoned), and catalog references (pw_slots.size_id / type_id)
-- whose parents are a handful of rows.

-- better-auth looks sessions and accounts up by user.
create index if not exists session_user_idx on session ("userId");
create index if not exists account_user_idx on account ("userId");

-- Studio lists: where "userId" = ? order by "createdAt" desc.
create index if not exists sales_user_idx on sales ("userId", "createdAt");
create index if not exists documents_user_idx on documents ("userId", "createdAt");
create index if not exists rooms_user_idx on rooms ("userId", "createdAt");

-- Artwork joins, and the ON DELETE SET NULL / CASCADE that fire when an artwork is erased.
create index if not exists pw_bookings_artwork_idx on pw_bookings (artwork_id) where artwork_id is not null;
create index if not exists pw_ugc_artwork_idx on pw_ugc_submissions (artwork_id) where artwork_id is not null;
create index if not exists exhibition_artworks_artwork_idx on exhibition_artworks (artwork_id);
create index if not exists curator_picks_artwork_idx on curator_picks (artwork_id);

-- Per-user lookups (studio pages, DPDP export and erasure).
create index if not exists pw_audit_log_actor_idx on pw_audit_log (actor_id) where actor_id is not null;
create index if not exists pw_ugc_user_idx on pw_ugc_submissions (user_id) where user_id is not null;
create index if not exists pw_grievances_user_idx on pw_grievances (user_id) where user_id is not null;
create index if not exists idx_coa_user on coa_certificates (user_id);
create index if not exists idx_mint_user on mint_commitments (user_id);
create index if not exists exhibitions_user_idx on exhibitions (user_id);
create index if not exists art_tags_bound_by_idx on art_tags (bound_by) where bound_by is not null;

-- The Merkle cron loads every commitment of a root.
create index if not exists idx_mint_merkle_root on mint_commitments (merkle_root_id) where merkle_root_id is not null;
