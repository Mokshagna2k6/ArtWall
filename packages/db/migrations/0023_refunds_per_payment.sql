-- 0023: one refund per (booking, payment), not per booking.
--
-- 0022 made pw_refunds unique on booking_id. A booking can legitimately owe two
-- refunds: the policy refund on its settled payment, and a full auto-refund of
-- a second (duplicate / late) Razorpay payment that could not be applied to it.
-- With one-per-booking the second insert failed, the webhook 500'd, and
-- Razorpay retried forever while the money sat with us.
--
-- Manual (offline) refunds have no payment_id; coalesce keeps them one per booking.

drop index if exists pw_refunds_booking_uidx;
create unique index if not exists pw_refunds_booking_payment_uidx
  on pw_refunds (booking_id, coalesce(payment_id, ''));
