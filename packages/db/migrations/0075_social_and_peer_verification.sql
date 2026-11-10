-- 0075: the social layer and peer/curator artist verification.
--
-- Two independent additions, in one migration because they share nothing but
-- the fact that both hang off `public."user"` and both are purely additive --
-- no existing column changes type, no existing row is rewritten.
--
-- ## 1. Social (likes, comments, follows, saves)
--
-- Deliberately NOT a generic "reactions on any entity" table. A polymorphic
-- subject_type/subject_id pair cannot carry a foreign key, so an artwork
-- delete would silently leave orphaned likes behind and every read would need
-- a defensive join. Artworks are the only thing likeable today, so the FK is
-- real and `on delete cascade` does the cleanup for free. When a second
-- likeable entity appears, add its own table rather than widening this one.
--
-- `artwork_likes` has no surrogate id: the (artwork_id, user_id) pair IS the
-- identity, which makes "like" an idempotent upsert and makes a double-tap
-- from two tabs harmless instead of a duplicate row.
--
-- Comments keep a surrogate id because the same user may comment many times,
-- and `parent_id` is a self-reference so one level of replies works without a
-- second table. Depth is not constrained here -- the UI renders two levels and
-- the read query decides; a deeper thread is a display question, not a data
-- integrity one.
--
-- ## 2. Peer and curator verification
--
-- `user."identityVerified"` already exists and means something different and
-- narrower: an admin checked identity documents. That column is untouched.
--
-- Artist verification is a *reputation* signal -- other artists and curators
-- vouching -- so it is a separate endorsement table plus a derived status
-- column on artist_profiles. The status is derived, not authoritative: it is
-- recomputed from the endorsement rows, and kept as a column only so list
-- pages can filter and sort without an aggregate join on every row.
--
-- Note `artist_profiles."userId"` is a quoted camelCase column (0003 created
-- it that way). Nothing below references it by name, but anything that later
-- does must quote it or Postgres will look for `userid`.

begin;

-- ---------------------------------------------------------------------------
-- 1. Likes
-- ---------------------------------------------------------------------------
create table if not exists artwork_likes (
  artwork_id text not null references artworks(id) on delete cascade,
  user_id    text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (artwork_id, user_id)
);

-- A profile asks "what has this user liked, most recent first"; the primary
-- key's leading column cannot serve that.
create index if not exists artwork_likes_user_idx
  on artwork_likes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Comments
-- ---------------------------------------------------------------------------
create table if not exists artwork_comments (
  id         text primary key,
  artwork_id text not null references artworks(id) on delete cascade,
  user_id    text not null references "user"(id) on delete cascade,
  -- A reply to another comment on the SAME artwork. Not enforced across
  -- artworks by a constraint (that needs a composite FK); the insert path
  -- checks it, because a cross-artwork reply is a bug, not an attack.
  parent_id  text references artwork_comments(id) on delete cascade,
  body       text not null,
  -- Soft delete: a removed comment whose replies survive must still occupy
  -- its place in the thread, or the replies become orphans with no context.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint artwork_comments_body_len check (char_length(body) between 1 and 2000)
);

create index if not exists artwork_comments_artwork_idx
  on artwork_comments (artwork_id, created_at desc);
create index if not exists artwork_comments_parent_idx
  on artwork_comments (parent_id) where parent_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Follows
-- ---------------------------------------------------------------------------
-- Follower/followee are both users, not artist_profiles: a buyer with no
-- artist profile can be followed back, and a profile may not exist yet when
-- the follow happens.
create table if not exists user_follows (
  follower_id text not null references "user"(id) on delete cascade,
  followee_id text not null references "user"(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint user_follows_no_self check (follower_id <> followee_id)
);

-- "who follows this artist" -- the reverse of the primary key's direction.
create index if not exists user_follows_followee_idx
  on user_follows (followee_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Saves (private bookmarks)
-- ---------------------------------------------------------------------------
-- Distinct from collections, which are curated, titled and often public. A
-- save is a private "come back to this" with no title and no ordering.
create table if not exists artwork_saves (
  artwork_id text not null references artworks(id) on delete cascade,
  user_id    text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, artwork_id)
);

-- ---------------------------------------------------------------------------
-- 5. Artist endorsements (peer + curator verification)
-- ---------------------------------------------------------------------------
create table if not exists artist_endorsements (
  id          text primary key,
  -- The artist being vouched for.
  artist_id   text not null references "user"(id) on delete cascade,
  -- Who vouched.
  endorser_id text not null references "user"(id) on delete cascade,
  -- 'peer'    -- another artist with a published profile.
  -- 'curator' -- an active curator. Outranks peer when deriving status.
  kind        text not null,
  note        text,
  created_at  timestamptz not null default now(),
  constraint artist_endorsements_kind check (kind in ('peer', 'curator')),
  constraint artist_endorsements_no_self check (artist_id <> endorser_id),
  -- One endorsement per endorser per artist. A second attempt updates the
  -- existing row rather than inflating the count.
  unique (artist_id, endorser_id)
);

create index if not exists artist_endorsements_artist_idx
  on artist_endorsements (artist_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Derived verification status on the profile
-- ---------------------------------------------------------------------------
-- 'unverified' | 'peer_verified' | 'curator_verified'
--
-- Recomputed by the app (features/social/endorsements.ts) whenever an
-- endorsement is added or removed. Stored rather than computed per read so
-- /artists can filter and order on it without an aggregate subquery per row.
alter table artist_profiles
  add column if not exists verification_status text not null default 'unverified';

alter table artist_profiles
  drop constraint if exists artist_profiles_verification_status_check;
alter table artist_profiles
  add constraint artist_profiles_verification_status_check
  check (verification_status in ('unverified', 'peer_verified', 'curator_verified'));

commit;
