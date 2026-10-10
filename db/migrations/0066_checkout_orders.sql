-- 0066: buyer checkout core (cart, orders, per-seller sub-orders, payments, refunds).
--
-- One checkout = one Razorpay payment for the cart total (`orders` +
-- `order_payments`), split into one `seller_orders` row per seller. Every
-- seller-facing lifecycle fact (acceptance, shipping, escrow, release, refund)
-- lives on the sub-order, so one seller declining or being refunded never
-- touches another seller's items. See docs/plans/BUYER_CHECKOUT_PLAN.md.
--
-- Additive only. The marketplace is behind MARKETPLACE_CHECKOUT_ENABLED
-- (default off); these tables are inert until it is switched on.
-- buyer_id / seller_id are deliberately NOT foreign keys to "user": these are
-- financial records that must outlive account erasure (the user row is a
-- tombstone, but we do not want an FK to dictate order retention).

begin;

create table if not exists marketplace_settings (
  id integer primary key check (id = 1),
  -- How long an unpaid checkout keeps its artworks reserved.
  checkout_hold_minutes integer not null default 30 check (checkout_hold_minutes between 5 and 1440),
  -- Seller must accept a paid order within this window or it is refunded.
  seller_accept_hours integer not null default 48 check (seller_accept_hours between 1 and 720),
  -- After courier-confirmed delivery, funds stay held this long (Bible: 72h
  -- inspection / dispute window) unless the buyer confirms receipt earlier.
  dispute_window_days integer not null default 3 check (dispute_window_days between 0 and 60),
  -- Flat shipping per seller sub-order until live courier rates exist.
  flat_shipping_paise integer not null default 25000 check (flat_shipping_paise >= 0),
  -- integer paise tops out near Rs 2.1 crore; cap well below.
  max_order_paise integer not null default 200000000 check (max_order_paise > 0),
  updated_at timestamptz not null default now()
);
insert into marketplace_settings (id) values (1) on conflict (id) do nothing;

-- Persisted per-buyer cart. Artworks are 1-of-1, so quantity is implicitly 1
-- and (user, artwork) is the key. curator_user_id carries curator attribution
-- when the work was added from a curator's collection.
create table if not exists cart_items (
  user_id text not null references "user" (id) on delete cascade,
  artwork_id text not null references artworks (id) on delete cascade,
  curator_user_id text,
  source_collection_id text,
  added_at timestamptz not null default now(),
  primary key (user_id, artwork_id)
);

create sequence if not exists orders_number_seq;

create table if not exists orders (
  id text primary key,
  order_number text not null unique,
  buyer_id text not null,
  buyer_email text not null,
  buyer_phone text not null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'expired', 'cancelled')),
  subtotal_paise integer not null check (subtotal_paise >= 0),
  shipping_paise integer not null check (shipping_paise >= 0),
  gst_paise integer not null default 0 check (gst_paise >= 0),
  total_paise integer not null check (total_paise > 0),
  constraint orders_total_sum check (total_paise = subtotal_paise + shipping_paise + gst_paise),
  currency text not null default 'INR' check (currency = 'INR'),
  shipping_address jsonb not null,
  idempotency_key text,
  provider_order_id text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists orders_idempotency_idx on orders (buyer_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists orders_provider_order_idx on orders (provider_order_id) where provider_order_id is not null;
create index if not exists orders_buyer_idx on orders (buyer_id, created_at desc);
create index if not exists orders_pending_idx on orders (expires_at) where status = 'pending_payment';

create table if not exists seller_orders (
  id text primary key,
  order_id text not null references orders (id) on delete restrict,
  seller_id text not null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'expired', 'cancelled', 'paid', 'processing',
                      'shipped', 'delivered', 'completed', 'refund_pending', 'refunded')),
  subtotal_paise integer not null check (subtotal_paise > 0),
  shipping_paise integer not null check (shipping_paise >= 0),
  total_paise integer not null check (total_paise > 0),
  constraint seller_orders_total_sum check (total_paise = subtotal_paise + shipping_paise),
  -- Commission snapshot, taken at checkout from the open commission policy
  -- version; never recomputed. platform + curator + seller_net = subtotal
  -- (shipping is passed through to the seller).
  platform_fee_paise integer not null check (platform_fee_paise >= 0),
  curator_fee_paise integer not null default 0 check (curator_fee_paise >= 0),
  seller_net_paise integer not null check (seller_net_paise >= 0),
  constraint seller_orders_split_sum check (platform_fee_paise + curator_fee_paise + seller_net_paise = subtotal_paise),
  commission_policy_version_id text not null references commission_policy_versions (id) on delete restrict,
  refunded_paise integer not null default 0 check (refunded_paise >= 0 and refunded_paise <= total_paise),
  accept_by timestamptz,
  release_eligible_at timestamptz,
  courier text,
  awb text,
  tracking_url text,
  cancel_reason text,
  paid_at timestamptz,
  accepted_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  buyer_confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, seller_id)
);
create index if not exists seller_orders_seller_idx on seller_orders (seller_id, status);
create index if not exists seller_orders_status_idx on seller_orders (status);

create table if not exists order_items (
  id text primary key,
  order_id text not null references orders (id) on delete restrict,
  seller_order_id text not null references seller_orders (id) on delete restrict,
  artwork_id text references artworks (id) on delete set null,
  seller_id text not null,
  title_snapshot text not null,
  image_snapshot text,
  unit_price_paise integer not null check (unit_price_paise > 0),
  quantity integer not null default 1 check (quantity = 1),
  platform_fee_paise integer not null check (platform_fee_paise >= 0),
  curator_user_id text,
  curator_fee_paise integer not null default 0 check (curator_fee_paise >= 0),
  seller_net_paise integer not null check (seller_net_paise >= 0),
  constraint order_items_split_sum check (platform_fee_paise + curator_fee_paise + seller_net_paise = unit_price_paise),
  -- True while this line holds its artwork (reserved or sold). Cleared when
  -- the line is released; the partial unique index below is the database-level
  -- oversell guard, independent of the artworks.status compare-and-swap.
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_seller_order_idx on order_items (seller_order_id);
create unique index if not exists order_items_one_active_per_artwork on order_items (artwork_id) where active and artwork_id is not null;

-- Append-only transition log, written in the same transaction as the change.
create table if not exists order_events (
  id bigint generated always as identity primary key,
  order_id text not null references orders (id) on delete restrict,
  seller_order_id text references seller_orders (id) on delete restrict,
  from_status text,
  to_status text not null,
  actor_id text,
  note text,
  at timestamptz not null default now()
);
create index if not exists order_events_order_idx on order_events (order_id, at);

-- One Razorpay payment covers the whole checkout. event_id and
-- provider_payment_id are the idempotency keys (unique, partial).
create table if not exists order_payments (
  id text primary key,
  order_id text not null references orders (id) on delete restrict,
  provider text not null default 'razorpay',
  provider_order_id text,
  provider_payment_id text,
  event_id text,
  amount_paise integer not null check (amount_paise >= 0),
  status text not null default 'created' check (status in ('created', 'captured', 'failed', 'refunded')),
  failure_code text,
  captured_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists order_payments_payment_idx on order_payments (provider_payment_id) where provider_payment_id is not null;
create unique index if not exists order_payments_event_idx on order_payments (event_id) where event_id is not null;
create index if not exists order_payments_order_idx on order_payments (order_id);

-- Per-sub-order refunds, partial against the single payment. Same outbox shape
-- as pw_refunds (0022): written in the caller's transaction, sent to Razorpay
-- afterwards, retried by /api/cron/refunds. seller_order_id is null only for
-- an orphan payment refunded whole (amount mismatch, late capture).
create table if not exists order_refunds (
  id text primary key,
  order_id text not null references orders (id) on delete restrict,
  seller_order_id text references seller_orders (id) on delete restrict,
  payment_id text,
  amount_paise integer not null check (amount_paise > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'failed', 'manual')),
  provider_refund_id text,
  attempts integer not null default 0,
  last_error text,
  reason text not null,
  kind text not null check (kind in ('seller_declined', 'seller_timeout', 'buyer_cancel', 'admin', 'auto_orphan')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists order_refunds_provider_refund_idx on order_refunds (provider_refund_id) where provider_refund_id is not null;
create index if not exists order_refunds_open_idx on order_refunds (status, updated_at) where status in ('pending', 'processing', 'failed');
create index if not exists order_refunds_seller_order_idx on order_refunds (seller_order_id);

commit;
