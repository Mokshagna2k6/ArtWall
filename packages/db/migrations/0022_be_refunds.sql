-- 0022: pw_refunds — a durable record of every refund owed, written BEFORE
-- any money moves.
--
-- Refunds used to call Razorpay from inside the booking-cancel transaction. If
-- anything after that call failed, the transaction rolled back and the DB said
-- "paid" while Razorpay had already returned the money — with no record of it.
--
-- Now: the cancel transaction commits the booking status, the ledger expense
-- and a 'pending' row here. Only then is Razorpay called (processRefund), and
-- the row moves to 'processed' with Razorpay's refund id, or 'failed' with the
-- error for the retry cron. Every Razorpay refund carries notes.refundId = id,
-- so a retry after a crash first looks the refund up instead of issuing a
-- second one.
--
--   pending    → owed, not yet sent
--   processing → claimed by a worker (stale after 10 min → re-claimable)
--   processed  → Razorpay accepted it (provider_refund_id set)
--   failed     → last attempt errored; retried by /api/cron/refunds
--   manual     → offline payment (cash/bank): an admin refunds by hand

create table if not exists pw_refunds (
  id                 text        primary key,
  booking_id         text        not null references pw_bookings(id) on delete restrict,
  payment_id         text,
  amount_paise       integer     not null check (amount_paise > 0),
  status             text        not null default 'pending',
  provider_refund_id text        unique,
  attempts           integer     not null default 0,
  last_error         text,
  reason             text,
  created_by         text        references "user"(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint pw_refunds_status_check check (status in
    ('pending', 'processing', 'processed', 'failed', 'manual')),
  constraint pw_refunds_online_check check (status = 'manual' or payment_id is not null)
);

-- One refund per booking, matching the ledger's source_ref 'refund:<booking>'.
create unique index if not exists pw_refunds_booking_uidx on pw_refunds (booking_id);
create index if not exists pw_refunds_open_idx on pw_refunds (status, updated_at)
  where status in ('pending', 'processing', 'failed');

-- The same Razorpay payment must never be recorded as two payment rows, from
-- any path (webhook, client verify). event_id is already unique; this covers
-- rows written without one.
create unique index if not exists pw_payments_payment_id_uidx
  on pw_payments (payment_id) where payment_id is not null;
