# pw_ledger — allowed values and joins

Source of truth: `db/migrations/0006_physical_wall.sql` (table), `0017_ledger_booking_fk.sql` (booking FK, amount check).

## Constraints

| Column         | Rule                                                                  |
| -------------- | --------------------------------------------------------------------- |
| `type`         | CHECK `pw_ledger_type_check`: **`'revenue'` or `'expense'` only**      |
| `amount_paise` | CHECK `pw_ledger_amount_check`: `>= 0`. Direction comes from `type`.   |
| `source_ref`   | Unique when not null. One system row per source event.                |
| `booking_id`   | FK → `pw_bookings(id)`, `on delete restrict`, indexed (`pw_ledger_booking_idx`). |

There is no `'payment'`, `'settlement'` or `'refund'` type. Filtering on them returns nothing; inserting them fails.

## Every writer

| Writer                                             | type      | category       | source_ref            | booking_id        |
| -------------------------------------------------- | --------- | -------------- | --------------------- | ----------------- |
| `actions/payment.ts` (captured payment)            | `revenue` | `booking`      | `booking:<bookingId>` | the booking       |
| `actions/booking.ts` (artist cancels, refund)      | `expense` | `refund`       | `refund:<bookingId>`  | the booking       |
| `actions/admin-slots.ts` (admin releases, refund)  | `expense` | `refund`       | `refund:<bookingId>`  | the booking       |
| `actions/perk.ts` (Platter perk, Artwall's share)  | `expense` | `platter-perk` | `perk:<redemptionId>` | booking if artist perk, else null |
| `actions/ledger.ts` (manual founder entry)         | zod enum  | `CATEGORIES`   | null                  | null              |

Manual categories (app-enforced, not DB): revenue — `booking, addon, coffee, commission, other`; expense — `venue-share, ops, platter-perk, refund, misc`.

## Reporting joins

```sql
-- Booking revenue by period
select date_trunc('month', l.entry_date)::date as period,
       sum(l.amount_paise)                     as revenue_paise,
       count(distinct l.booking_id)::int       as bookings
from pw_ledger l
where l.type = 'revenue' and l.booking_id is not null
group by 1 order by 1 desc;

-- Net per booking (revenue minus refunds/perks)
select booking_id,
       sum(case when type = 'revenue' then amount_paise else -amount_paise end) as net_paise
from pw_ledger
where booking_id is not null
group by booking_id;
```

Booking money fields are `pw_bookings.total_amount_paise` / `gst_amount_paise` (there is no `total_paise` on bookings; `total_paise` is a `pw_invoices` column).
