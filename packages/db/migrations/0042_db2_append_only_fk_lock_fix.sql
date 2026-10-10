-- 0042: append-only tables need UPDATE ACL back, or Postgres's own FK checks break.
--
-- Bug found running the DB suite as a genuine non-superuser owner (Neon's
-- neondb_owner is a member of neon_superuser and bypasses ACL checks
-- entirely, which is why this never showed up there, or under a Docker
-- superuser). `SELECT ... FOR KEY SHARE` is what Postgres's own referential-
-- integrity trigger issues against a table's rows when a table IT REFERENCES
-- is deleted (e.g. `delete from artworks` must confirm no provenance_events
-- row still points at the artwork). That lock clause requires ACL_UPDATE on
-- the table being locked, not ACL_SELECT — so revoking UPDATE from every
-- append-only table (0028) also revoked the ability to ever delete a row
-- anything append-only points at, DPDP erasure included: every deleteFrom
-- (artworks|user|...) that has an append-only child (pw_ledger,
-- provenance_events, pw_audit_log, pw_condition_photos, pw_damage_records,
-- artwork_ownership_history, artwork_price_history) failed 42501 the moment
-- the connecting role was a real (non-bypassing) owner.
--
-- The fix is not "grant less" (0028's intent), it's grant the ACL back to the
-- OWNER (who runs migrate.mjs, and today is who DATABASE_URL connects as) and
-- let the trigger be the only real enforcement for that role — it already is:
-- the trigger fires before every UPDATE regardless of ACL and rejects any
-- column change (23001), proven by the invariant tests, so this changes
-- nothing about what an UPDATE can actually do. It only lets Postgres's own
-- internal machinery take the row lock it always needed.
--
-- artwall_app keeps its UPDATE revoke: it is the least-privilege role
-- (0035) meant to run with no UPDATE ACL at all on these tables, ever, by
-- design. It has no row-locking need of its own here because production
-- does not run DPDP erasure, or anything else that deletes an artwork/user
-- row, as artwall_app; that always runs as the owner (docs/db/invariants.md,
-- "Application role"). If artwall_app ever becomes the role erasure runs as,
-- it will need this same grant then, not before.

grant update on pw_ledger to current_user;
grant update on provenance_events to current_user;
grant update on pw_audit_log to current_user;
grant update on pw_condition_photos to current_user;
grant update on pw_damage_records to current_user;
grant update on artwork_ownership_history to current_user;
grant update on artwork_price_history to current_user;
