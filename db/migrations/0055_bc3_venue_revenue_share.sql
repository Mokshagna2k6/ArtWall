-- 0055 (renumbered from 0045 during 6-branch integration merge — collided
-- with Database Phase 3's unrelated 0045_db3_demand_engine.sql, since both
-- branches diverged before either existed): seed the venue revenue-share
-- commission_policies kind (BC-3.14).
--
-- Reuses the existing commission_policies table/invariants (one active row
-- per kind, versioned, no literal bps in src) rather than a new table — see
-- src/features/policy/commission.ts's CommissionKind doc comment for why
-- on-chain WallOS slot registration is out of scope for this migration.
--
-- 2000 bps (20%) is a placeholder, same spirit as 0043's seeded rates and
-- pw_refund_policy's seeded 50% (see scripts/seed-physical-wall.mjs's own
-- "placeholder, confirm before launch" note) — an admin can change the
-- active row at any time; this migration only ensures one exists so
-- getActiveCommissionPolicy("venue_revenue_share") never throws out of the box.

insert into commission_policies (id, kind, rate_bps, active, note)
values
  ('cpol_venue_rev_v1', 'venue_revenue_share', 2000, true, 'Placeholder venue revenue share — confirm before launch.')
on conflict (id) do nothing;
