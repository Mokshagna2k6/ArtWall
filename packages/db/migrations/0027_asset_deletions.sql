-- 0027: durable queue of Cloudinary assets to delete (BE-1.31 / BE-1.32).
--
-- DPDP erasure deletes a user's images (artworks, selfies, UGC, identity
-- documents) from Cloudinary, not just the DB rows that point at them. The
-- erasure transaction writes one row per public id here; the deletes happen
-- after commit, and anything that fails stays 'pending' with its error for the
-- data-retention cron to retry. The row holds only the opaque public id.

create table if not exists pw_asset_deletions (
  id          text        primary key,
  public_id   text        not null,
  reason      text        not null,
  status      text        not null default 'pending',
  attempts    integer     not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  constraint pw_asset_deletions_status_check check (status in ('pending', 'done', 'failed'))
);

create unique index if not exists pw_asset_deletions_public_id_uidx on pw_asset_deletions (public_id);
create index if not exists pw_asset_deletions_pending_idx on pw_asset_deletions (created_at) where status = 'pending';
