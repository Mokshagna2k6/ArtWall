-- 0087: the missing non-negative check on artwork_saves.last_notified_price_paise.
--
-- DB-2.08 (enforced by src/lib/db/__tests__/invariants.db.test.ts) requires
-- every `*_paise` column to carry a `>= 0` check: money is integer paise and
-- a negative amount is never a legitimate value, so the database refuses it
-- rather than trusting every write path to remember.
--
-- 0085 added this column without one. Caught by CI on the catch-up PR, not by
-- a reviewer — which is the point of having the invariant as a test.
--
-- A separate migration rather than an edit to 0085, because 0085 is already
-- applied to production: changing it in place would never run again there,
-- and the ledger is keyed by filename so the edit would be silently skipped.
--
-- Null stays allowed: it means "never notified yet" (see 0085's comment), and
-- is distinct from 0, which would mean a real notification at a price of zero.

begin;

alter table artwork_saves
  drop constraint if exists artwork_saves_last_notified_price_paise_check;

alter table artwork_saves
  add constraint artwork_saves_last_notified_price_paise_check
  check (last_notified_price_paise is null or last_notified_price_paise >= 0);

commit;
