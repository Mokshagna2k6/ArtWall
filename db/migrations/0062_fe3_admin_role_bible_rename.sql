-- 0062: Admin role model catch-up with the Bible's 8 named roles (FE-3.18).
--
-- The Bible (Section 24) names exactly 8 admin roles: Super, Operations,
-- Finance, Content, Support, Analytics, Wall Network, Blockchain. 0049 seeded
-- 8 roles but under different names/shorthand, so this migration reconciles
-- them instead of leaving two parallel vocabularies:
--
--   super_admin       -> kept as-is (IS the Bible's Super Admin, 1:1).
--   venue_admin       -> kept as-is. Maps 1:1 to "Wall Network Admin" — only
--                        the UI label changes (ROLE_DISPLAY_NAMES in
--                        authorize.ts), not the stored identifier, because
--                        `venue_admin` is a live foreign key value read by
--                        wallos/actions.ts, several *.db.test.ts fixtures and
--                        the grid/roles pages; renaming the id would be a much
--                        larger, riskier diff for a label-only change.
--   finance_admin, support_admin, content_admin -> kept as-is, same
--                        "identifier stays, label changes" reasoning: they
--                        already match the Bible's Finance/Support/Content
--                        Admin by name and domain.
--   readonly_admin    -> RENAMED to analytics_admin (real migration, this
--                        file): the Bible has no "readonly", it has
--                        "Analytics Admin", and analytics IS what a
--                        read-only dashboard role is for. An UPDATE on the
--                        existing row's `name` column (not a delete+insert)
--                        so every existing grant in admin_role_assignments
--                        (which points at admin_roles.id, not .name) carries
--                        over automatically with zero data loss.
--   curator_admin     -> kept as its own, 9th, non-Bible role. Curator
--                        application review is not one of the Bible's 8
--                        domains, and folding it silently into content_admin
--                        or operations_admin would hand every holder of that
--                        Bible role a permission they were never granted
--                        (curator approval/suspension) or revoke a working
--                        permission from people who only have curator_admin
--                        today. Decision: leave the grant exactly as-is, and
--                        surface the curator-review link from the Content
--                        Admin landing page in the UI (closest domain:
--                        curation is content work), gated by its own
--                        curator_admin check, unrelated to whether the
--                        viewer also holds content_admin.
--   compliance_admin  -> kept as its own, non-Bible role, same reasoning as
--                        curator_admin (identity/KYC review is not one of
--                        the 8). Surfaced from the Operations Admin landing
--                        page (compliance/identity review is operational
--                        work), gated by its own compliance_admin check.
--   operations_admin  -> NEW (no existing equivalent). Will gate the
--                        Operations Admin landing page once admins are
--                        explicitly granted it; existing ops pages (bookings,
--                        queue, grid, calendar) stay on the broad
--                        requireRole("admin") catch-all they already use, per
--                        docs/policy-engine.md's documented scope decision —
--                        not tightened in this migration.
--   blockchain_admin  -> NEW (no existing equivalent). Gates the Blockchain
--                        Admin landing page, which surfaces the real
--                        merkle_roots status table read-only; no write action
--                        is gated behind it yet.

begin;

update admin_roles
set name = 'analytics_admin',
    description = 'Read-only dashboard access, no write actions.'
where name = 'readonly_admin';

insert into admin_roles (id, name, description) values
  ('role_operations_admin', 'operations_admin', 'Day-to-day wall operations: bookings, install queue, calendar.'),
  ('role_blockchain_admin', 'blockchain_admin', 'On-chain provenance: Merkle root posting status, tag binding.')
on conflict (id) do nothing;

commit;
