-- 0057: escrow release state for BE-3.11/3.12.
--
-- 0049 created escrow_holds/escrow_releases as pure schema with no writer
-- (docs/policy-engine.md: "no ledger-producing commission flow exists yet").
-- This is that writer's migration: BE-3.11's escrow service
-- (src/features/escrow/service.ts) needs somewhere to record (a) the
-- precondition that gates a release — "delivery confirmation or the dispute
-- window" (Bible section 166 rules 25-30) — and (b) which commission split
-- priced a hold, so a release can be computed deterministically even if the
-- open commission_policy_versions row later changes.
--
-- No "delivery confirmed" flag exists anywhere in this codebase yet (checked:
-- pw_bookings has no such column; shipments.status has a 'delivered' state
-- but nothing joins it back to a release decision). Per the Bible's own
-- wording ("delivery confirmation OR the dispute window"), release is gated
-- on EITHER signal — this migration adds the dispute-window half
-- (release_eligible_at, set at hold-creation time to now() + dispute window)
-- and a hold-level status so "already released/refunded" is a real,
-- queryable state rather than inferred from escrow_releases rows. The
-- delivery-confirmation half is read from shipments.status = 'delivered' at
-- call time by the service — no new column needed for that, since shipments
-- already carries it.

begin;

alter table escrow_holds add column if not exists status text not null default 'held';
alter table escrow_holds drop constraint if exists escrow_holds_status_check;
alter table escrow_holds add constraint escrow_holds_status_check
  check (status in ('held', 'released', 'refunded'));

-- 72h default per docs/WORK_PLAN.md's "72-hr inspection state machine"
-- (Phase 3+ scope note); overridable per hold for a future admin-configured
-- window without a schema change.
alter table escrow_holds add column if not exists dispute_window_days integer not null default 3
  check (dispute_window_days > 0);
alter table escrow_holds add column if not exists release_eligible_at timestamptz;

-- Snapshot of which split version priced this hold, same discipline as
-- pw_ledger.commission_policy_version_id (0044/DB-3.05): resolved at
-- capture time, never re-read later, so a subsequent policy change can never
-- silently re-price a hold already taken.
alter table escrow_holds add column if not exists commission_policy_version_id text
  references commission_policy_versions (id) on delete restrict;

create index if not exists escrow_holds_status_idx on escrow_holds (status) where status = 'held';

commit;
