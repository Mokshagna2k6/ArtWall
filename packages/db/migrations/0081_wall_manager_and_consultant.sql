-- 0081: Wall Manager and Wall Consultant (WallOS roles, Bible §13/§35).
--
-- Locked Rule 34: "Wall Manager is distinct from Venue Owner."
-- Locked Rule 35: "Wall Consultant is distinct from Wall Manager."
--
-- ## Why NOT the existing admin-role axis
--
-- `admin_role_assignments` -> `admin_roles` already exists (0049/0059) and
-- already carries a `venue_admin` ("Wall Network Admin") role. It is tempting
-- to add two more rows to `admin_roles` and stop. That would be wrong, and
-- wrong in the direction that over-grants:
--
--  * That axis is **global**. A row there says "this user holds this role
--    platform-wide"; it has no venue column and no way to acquire one without
--    changing what every existing grant means. Bible §13 says a Wall Manager
--    manages walls *on behalf of specific assigned venues* — one or more, not
--    all of them. Expressing that on a global table would mean a Wall Manager
--    hired by one hotel could act on every venue on the platform.
--  * Granting an `admin_roles` role also sets `user.role = 'admin'` (AGENTS.md),
--    because the admin area's page gate reads that column. Neither of these is
--    an internal platform-staff role: a Wall Manager is venue-side staff, and a
--    Wall Consultant is **external** (an independent advisor who earns a
--    referral fee plus 0.5% of first-year wall revenue). Pushing either onto
--    the admin axis would hand outsiders the internal admin surface.
--  * Bible §24 fixes the admin roles at exactly eight. Adding to that list
--    would conflate the WallOS role axis (§35, ten roles) with the admin role
--    axis (§24, eight) — the third-axis separation AGENTS.md's "Core model"
--    section exists to protect.
--
-- So this is a FOURTH axis: `venue_role_assignments`, scoped to one venue per
-- row. Multi-venue access (Rule 34's "one or more venues") is several rows,
-- which is also what makes revoking one venue's access possible without
-- touching the others.
--
-- ## Why one table for both roles, not two
--
-- Wall Manager and Wall Consultant differ in what they may *do*, not in how
-- they are *assigned*: both are "this person, this venue, granted by someone,
-- revocable". A `role` column keeps them distinct (Rule 35) while the grant /
-- revoke / audit plumbing is written once. Rule 35 is enforced where it
-- matters — in the authorization helpers, which never accept one role as a
-- substitute for the other, and never fall back to a venue-wide "any role"
-- check.
--
-- The table is deliberately NOT a general "any WallOS role" table. The other
-- eight §35 roles (Venue Owner, Venue Admin, Venue Manager, Wall Technician,
-- Installation Partner, Curator, Wall Network Admin, Hardware Admin) are not
-- in scope here and three of them already live elsewhere (`curators`,
-- `venue_admin`), so the check constraint lists exactly the two roles this
-- migration introduces. Adding a third later is one `alter ... check`.
--
-- Shape follows `admin_role_assignments` exactly (text ids, granted_by /
-- granted_at / revoked_by / revoked_at rather than a delete) so revocation is
-- auditable and a past grant remains visible after it ends.
--
-- Purely additive: no existing table, column or row is changed.

begin;

create table if not exists venue_role_assignments (
  id          text primary key,
  user_id     text not null references "user"(id) on delete cascade,
  venue_id    text not null references venues(id) on delete cascade,
  role        text not null check (role in ('wall_manager', 'wall_consultant')),
  granted_by  text references "user"(id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_by  text references "user"(id) on delete set null,
  revoked_at  timestamptz
);

-- At most one LIVE grant of a role per (user, venue). A partial unique index
-- rather than a plain unique constraint, so the history of revoked grants is
-- kept (and re-granting after a revoke is allowed) while a double-click or a
-- retried grant cannot create two live rows that then need two revokes.
create unique index if not exists venue_role_assignments_live_uniq
  on venue_role_assignments (user_id, venue_id, role)
  where revoked_at is null;

-- The authorization hot path: "does this user hold this role on this venue,
-- right now". Every page load and server action behind one of these roles runs
-- it, so it gets its own index rather than relying on the unique index above
-- (which leads with user_id and would still work, but this one also serves the
-- "who manages this venue" direction).
create index if not exists venue_role_assignments_venue_idx
  on venue_role_assignments (venue_id, role)
  where revoked_at is null;

comment on table venue_role_assignments is
  'WallOS venue-scoped roles (Bible §13/§35, Locked Rules 34-35). Separate from admin_role_assignments, which is global and internal-staff-only; a row here grants one role on ONE venue. wall_manager = venue-side wall operations; wall_consultant = external advisory.';

commit;
