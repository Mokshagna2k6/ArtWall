-- 0067: hook escrow up to seller sub-orders; payout ledger for manual batches.
--
-- escrow_holds (0049/0057) was booking-only. A hold now belongs to exactly one
-- of a booking or a seller sub-order (XOR). The release-cap trigger from 0049
-- is untouched and still applies. Existing rows all have booking_id, so the
-- relaxed NOT NULL + XOR check cannot reject any current data.

begin;

alter table escrow_holds alter column booking_id drop not null;
alter table escrow_holds add column if not exists seller_order_id text references seller_orders (id) on delete restrict;
alter table escrow_holds drop constraint if exists escrow_holds_one_target;
alter table escrow_holds add constraint escrow_holds_one_target
  check ((booking_id is null) <> (seller_order_id is null));
create unique index if not exists escrow_holds_seller_order_uidx on escrow_holds (seller_order_id) where seller_order_id is not null;

-- Money owed to a payee once escrow releases. v1 payout is a manual,
-- Finance-approved batch: Finance pays out of band and records the UTR here.
-- The platform's own commission is not a payout.
create table if not exists payouts (
  id text primary key,
  seller_order_id text not null references seller_orders (id) on delete restrict,
  payee_user_id text not null,
  payee_kind text not null check (payee_kind in ('artist', 'curator')),
  amount_paise integer not null check (amount_paise > 0),
  status text not null default 'owed' check (status in ('owed', 'paid', 'held')),
  utr text,
  approved_by text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_order_id, payee_kind, payee_user_id)
);
create index if not exists payouts_status_idx on payouts (status, created_at);
create index if not exists payouts_payee_idx on payouts (payee_user_id);

commit;
