-- 0056: widen art_tags.binding_status for BC-3.13's provisioning lifecycle.
--
-- Reconciliation note (6-branch integration merge):
--
-- blockchain-phase3-complete branched from blockchain-phase2-harden, which
-- predates Database Phase 3 entirely, so it had no idea Database Phase 3
-- (already merged, see 0049/0052) had independently added the exact same
-- three columns to art_tags — key_reference, sun_counter_last_seen,
-- binding_status — plus a binding_level GENERATED STORED column computed
-- from them (0052). Its own migration, 0044_bc3_tag_crypto_binding.sql, was
-- dropped during this merge rather than applied, since re-adding columns
-- that already exist (even with `if not exists`) is confusing and its
-- `create index` would have been the only genuinely new statement in it.
--
-- The two branches' column *types* and binding_level's generated expression
-- are identical in substance. The one real difference: DB-3.11 (0049) used a
-- 3-state binding_status (unbound, bound, revoked), while BC-3.13's
-- src/features/art-tags/actions.ts genuinely needs a 4th state —
-- 'provisioned' — to distinguish "tag row exists, no KMS key yet" from "KMS
-- key issued (provisionKeyReference called), not yet bound to an artwork".
-- That is a real state createTag/bindTagToArtwork write and read, not a
-- naming accident, so simply keeping 0049's 3-state CHECK would make BC-3.13's
-- own code fail its own constraint the moment it inserts 'provisioned'.
--
-- Resolution: widen the CHECK to the superset (unbound's slot is split into
-- unprovisioned + provisioned; bound/revoked are unchanged and mean the same
-- thing in both models), move the column default to 'unprovisioned' (BC-3.13's
-- more precise name for the same initial state 0049 called 'unbound'), and
-- backfill existing 'unbound' rows to match. binding_level (0052) needs no
-- change at all: its generated expression only special-cases binding_status
-- = 'bound', which is unaffected by this widening.

begin;

-- The old 3-state check must be dropped before the backfill below, or the
-- UPDATE to 'unprovisioned' (not in the old allowed set) violates it.
alter table art_tags drop constraint if exists art_tags_binding_status_check;

update art_tags set binding_status = 'unprovisioned' where binding_status = 'unbound';

alter table art_tags alter column binding_status set default 'unprovisioned';

alter table art_tags add constraint art_tags_binding_status_check
  check (binding_status in ('unprovisioned', 'provisioned', 'bound', 'revoked'));

create index if not exists idx_art_tags_binding_status on art_tags (binding_status);

commit;
