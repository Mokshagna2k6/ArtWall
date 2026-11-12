-- 0085: offers (Bible §17 Part 1) and verified-purchase reviews (rule 39).
--
-- ## 1. Offers
--
-- One row per *message* in a negotiation, not one per negotiation: a buyer's
-- opening offer, the artist's counter, the buyer's counter are all rows in the
-- same thread, linked by `thread_id`. That is what makes the Bible's "maximum
-- 2 counter rounds" countable -- the limit is `count(*) where kind='counter'`
-- on the thread, which a single mutable row could not express without losing
-- the history that an accepted offer's audit trail needs.
--
-- The thread's head row (round 0) carries the thread's status. Replies are
-- immutable once written.
--
-- Money is `*_paise` integer, like every other amount in this schema. Never a
-- float, never rupees.
--
-- ### The 50% floor
-- `offer_amount_paise >= ceil(asking_price_paise / 2)` is a CHECK, not just an
-- application rule, because it is the anti-spam rule the Bible names and the
-- only way to be sure a future caller (an import, an admin tool) cannot write
-- a 1-rupee offer. `asking_price_paise` is snapshotted on the row for exactly
-- that reason: a CHECK cannot reach into `artworks`, and the floor must be
-- judged against the price that was on the page when the offer was made, not
-- against a price the artist changed afterwards.
--
-- ### Privacy (§44, rule 40)
-- Nothing here is public. The artwork page shows a COUNT, a RANGE and a
-- recency -- derived in SQL, never individual rows -- so no table below needs
-- a "public" flag; the read path simply never selects buyer_id.
--
-- ## 2. Reviews
--
-- Rule 39: a review requires a verified purchase. Enforced in the application
-- (`features/reviews/actions.ts` joins orders -> seller_orders -> order_items
-- before inserting) AND partially here: `order_item_id` is NOT NULL and
-- references the specific purchase, so a review with no purchase behind it
-- cannot exist as a row. `unique (order_item_id)` makes it one review per
-- purchase rather than per person, which is the correct grain when someone
-- buys two works from the same artist.
--
-- The artist's response lives on the review row, not in a second table: the
-- Bible allows exactly one response per review, so a one-to-many table would
-- model a cardinality that is not allowed.

begin;

-- ---------------------------------------------------------------------------
-- 1. Offers
-- ---------------------------------------------------------------------------
create table if not exists artwork_offers (
  id         text primary key,
  -- The negotiation this message belongs to. The opening offer's id IS the
  -- thread id, so a thread is never without a head.
  thread_id  text not null,
  artwork_id text not null references artworks(id) on delete cascade,
  -- Who is negotiating. Constant across a thread; denormalised onto every row
  -- so a reply never needs a join to know who it is talking to.
  buyer_id   text not null references "user"(id) on delete cascade,
  seller_id  text not null references "user"(id) on delete cascade,

  -- 'offer'   -- the buyer's opening bid, round 0, one per thread.
  -- 'counter' -- a counter-offer from either side. At most 2 per thread.
  kind       text not null,
  -- 0 for the opening offer, 1 and 2 for the two allowed counter rounds.
  round      integer not null,
  -- Who wrote this message: 'buyer' | 'seller'.
  author_side text not null,

  offer_amount_paise   integer not null,
  -- The asking price at the moment this message was written. See the header:
  -- the 50% CHECK needs it, and an accepted offer's audit trail needs it.
  asking_price_paise   integer not null,
  message              text,

  -- Thread status, meaningful on the head row (round 0) only. Replies carry
  -- 'superseded' so a stale row can never be mistaken for the live state.
  -- 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'withdrawn' | 'superseded'
  status     text not null default 'pending',
  -- 7, 14 or 30 days out, chosen by the buyer (§17).
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),

  constraint artwork_offers_kind check (kind in ('offer', 'counter')),
  constraint artwork_offers_side check (author_side in ('buyer', 'seller')),
  constraint artwork_offers_status check (
    status in ('pending', 'accepted', 'declined', 'countered', 'expired', 'withdrawn', 'superseded')
  ),
  -- Round 0 is the opening offer; counters are rounds 1 and 2. The Bible's
  -- "maximum 2 counter rounds" is therefore also a column constraint, so the
  -- third counter cannot be written even by a caller that skipped the check.
  constraint artwork_offers_round check (round between 0 and 2),
  constraint artwork_offers_round_kind check (
    (kind = 'offer' and round = 0) or (kind = 'counter' and round between 1 and 2)
  ),
  constraint artwork_offers_amount_positive check (offer_amount_paise > 0),
  constraint artwork_offers_asking_positive check (asking_price_paise > 0),
  -- §17: minimum 50% of the asking price. ceil so that an odd asking price
  -- rounds against the buyer rather than letting 49.99% through.
  constraint artwork_offers_min_half check (
    offer_amount_paise >= ((asking_price_paise + 1) / 2)
  ),
  -- A buyer cannot bid on their own work.
  constraint artwork_offers_no_self check (buyer_id <> seller_id),
  -- One message per round per thread: two concurrent counters cannot both land.
  constraint artwork_offers_one_per_round unique (thread_id, round)
);

-- The artwork page's demand-supply panel: count, min/max and the latest
-- offer's timestamp, all from one index-only scan per artwork.
create index if not exists artwork_offers_artwork_idx
  on artwork_offers (artwork_id, created_at desc);

-- "my offers" (buyer) and "offers on my work" (artist).
create index if not exists artwork_offers_buyer_idx
  on artwork_offers (buyer_id, created_at desc);
create index if not exists artwork_offers_seller_idx
  on artwork_offers (seller_id, created_at desc);

-- The expiry sweep reads only live heads.
create index if not exists artwork_offers_pending_idx
  on artwork_offers (expires_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- 2. Reviews (rule 39: verified purchase required)
-- ---------------------------------------------------------------------------
create table if not exists artwork_reviews (
  id            text primary key,
  artwork_id    text not null references artworks(id) on delete cascade,
  reviewer_id   text not null references "user"(id) on delete cascade,
  -- The purchase that earns the right to review. NOT NULL: a review with no
  -- order behind it is exactly what rule 39 forbids, so it is unrepresentable.
  -- `on delete cascade` -- if the purchase is erased (a data-rights request),
  -- the review it justified goes with it.
  order_item_id text not null references order_items(id) on delete cascade,
  rating        integer not null,
  body          text,

  -- The artist's single reply (§16). On the row because the Bible allows one.
  response_body text,
  response_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint artwork_reviews_rating check (rating between 1 and 5),
  constraint artwork_reviews_body_len check (body is null or char_length(body) <= 4000),
  constraint artwork_reviews_response_len check (
    response_body is null or char_length(response_body) <= 4000
  ),
  -- One review per purchase. Buying the same work twice earns two reviews;
  -- reloading the form earns none.
  constraint artwork_reviews_one_per_purchase unique (order_item_id)
);

create index if not exists artwork_reviews_artwork_idx
  on artwork_reviews (artwork_id, created_at desc);
create index if not exists artwork_reviews_reviewer_idx
  on artwork_reviews (reviewer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Wishlist price-change watermark
-- ---------------------------------------------------------------------------
-- The wishlist IS `artwork_saves` (0075) -- deliberately not a second table.
-- What it lacked was the Bible's "tell me when a saved work changes price",
-- which needs somewhere to remember the price the saver last saw. One column
-- on the existing row, not a new table: it is per (user, artwork), which is
-- exactly that row's grain.
--
-- Null means "never notified yet"; the sweep seeds it on first run rather
-- than firing a notification for every historic save at once.
alter table artwork_saves
  add column if not exists last_notified_price_paise integer;

commit;
