-- ArtWall — physical wall engagement: reactions and post-exhibition feedback
--
-- Two small tables the prototype's flow needs (F24, F32). Both follow the same
-- rule as everything else in this feature: money in paise, no personal data
-- kept that the purpose does not require.
--
-- NOTE: scripts/migrate.mjs strips full-line comments and splits on semicolons,
-- so every statement must be flat. No DO $$ ... $$ blocks.

-- ── Reactions (F24) ─────────────────────────────────────────────────────────
-- Aggregate counts, not one row per person. The spec is explicit about this and
-- it is the whole privacy story: there is no "who reacted" to leak, because it
-- was never recorded. Anonymous visitors can react without an account, so a
-- per-person row would mean inventing an identifier for someone we have
-- deliberately not identified.
--
-- Rate limiting happens in memory against a rotating hash (see actions/visitor.ts)
-- and never touches this table.
create table if not exists pw_reactions (
  artwork_id text        not null,
  kind       text        not null,
  count      integer     not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (artwork_id, kind),
  constraint pw_reactions_kind_check check (kind in ('fire', 'love', 'art', 'gem', 'wow'))
);

create index if not exists pw_reactions_artwork_idx
  on pw_reactions (artwork_id);

-- ── Post-exhibition feedback (F32) ──────────────────────────────────────────
-- Voluntary, tied to a completed booking, one response per booking. The free
-- text is treated as potentially personal and rolls off with the booking's own
-- retention window rather than being kept indefinitely as "analytics".
create table if not exists pw_feedback (
  id         text        primary key,
  booking_id text        not null references pw_bookings(id) on delete cascade,
  artist_id  text        references "user"(id) on delete set null,
  rating     integer     not null check (rating between 1 and 5),
  nps        integer     check (nps between 0 and 10),
  note       text,
  created_at timestamptz not null default now()
);

-- One response per booking, enforced here rather than only in the action: the
-- survey link lands in an email and gets opened twice.
create unique index if not exists pw_feedback_booking_idx
  on pw_feedback (booking_id);
