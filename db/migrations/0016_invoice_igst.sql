-- 0016: IGST on GST invoices.
--
-- Indian GST: an intra-state supply is taxed CGST + SGST (split evenly), an
-- inter-state supply is taxed IGST alone. pw_invoices (0009) only had
-- cgst_paise/sgst_paise, and its split check (total = net + cgst + sgst) made
-- every inter-state invoice fail to insert: the tax was nowhere to go.
--
-- Named igst_paise to match its siblings cgst_paise / sgst_paise / net_paise.

alter table pw_invoices
  add column if not exists igst_paise integer not null default 0
  constraint pw_invoices_igst_paise_check check (igst_paise >= 0);

alter table pw_invoices drop constraint if exists pw_invoice_split_check;
alter table pw_invoices add constraint pw_invoice_split_check
  check (total_paise = net_paise + cgst_paise + sgst_paise + igst_paise);

-- One regime per invoice: IGST, or CGST+SGST, never both. The halves of an
-- intra-state split may differ by one paisa from rounding an odd total.
alter table pw_invoices add constraint pw_invoice_tax_regime_check check (
  (igst_paise = 0 or (cgst_paise = 0 and sgst_paise = 0))
  and abs(cgst_paise - sgst_paise) <= 1
);
