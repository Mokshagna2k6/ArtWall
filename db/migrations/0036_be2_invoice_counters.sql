-- 0050: gap-free invoice numbers per financial year (BE-2.05).
--
-- generateInvoice used to number with count(*) + 1 under an advisory lock.
-- That is gap-free only while no invoice row is ever deleted; one delete and
-- the next count re-issues a number that already exists. A Postgres SEQUENCE
-- is the other obvious choice and is wrong here: nextval() is not rolled back,
-- so a failed transaction burns a number and leaves a gap, which GST Rule 46
-- does not allow.
--
-- A counter row per financial year, incremented with
--   insert ... on conflict do update ... returning
-- inside the invoice transaction, takes a row lock that serialises concurrent
-- allocations and rolls back with the transaction: sequential and gap-free.

create table if not exists pw_invoice_counters (
  fiscal_year text    primary key check (fiscal_year ~ '^\d{4}-\d{2}$'),
  last_number integer not null check (last_number >= 0)
);

-- Seed from what is already issued, so numbering continues where it was.
insert into pw_invoice_counters (fiscal_year, last_number)
select split_part(number, '/', 2), max(split_part(number, '/', 3)::int)
from pw_invoices
where number ~ '^AW/\d{4}-\d{2}/\d+$'
group by 1
on conflict (fiscal_year) do update
  set last_number = greatest(pw_invoice_counters.last_number, excluded.last_number);
