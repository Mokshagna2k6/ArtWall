-- 0032: every foreign key states its ON DELETE, matching the DPDP erasure design (DB-2.11).
--
-- The erasure design (src/features/physical-wall/data-rights.ts): a user row is
-- never deleted, it becomes a tombstone that retained records point at. An
-- erased user's artworks and everything personal hanging off them are deleted
-- explicitly, children first, in one transaction. So:
--
--   RESTRICT  financial, legal and evidential records (payments, invoices,
--             agreements, ledger, audit, provenance, certificates, condition
--             reports) and anything pointing at a user. Deleting the parent
--             must fail loudly, never take the record with it or blank a column
--             in it. Erasure and the test purge delete children explicitly.
--   CASCADE   link rows and ephemeral user-owned data with no meaning alone
--             (curator picks, exhibition links, tag scans, sessions, studio CRM rows).
--   SET NULL  a record that outlives what it points at (a damage record keeps
--             existing after the artwork is erased; a tag outlives its binder).
--
-- Changed from the previous behaviour:
--   pw_payments / pw_invoices / pw_agreements / pw_condition_photos /
--   pw_damage_records .booking_id        CASCADE  -> RESTRICT  (a GST invoice must not vanish with a booking)
--   pw_audit_log.actor_id, pw_ledger.created_by,
--   pw_condition_photos.uploaded_by/slot_id, pw_damage_records.recorded_by/slot_id/photo_id
--                                        SET NULL -> RESTRICT  (these tables are append-only, 0028)
-- Every NO ACTION key is now an explicit choice, and user-owned tables that had
-- no FK at all (artworks, session, account, studio CRM tables) get one.

-- ── Booking children that are records ───────────────────────────────────────
alter table pw_payments drop constraint if exists pw_payments_booking_id_fkey;
alter table pw_payments add constraint pw_payments_booking_id_fkey
  foreign key (booking_id) references pw_bookings(id) on delete restrict;

alter table pw_invoices drop constraint if exists pw_invoices_booking_id_fkey;
alter table pw_invoices add constraint pw_invoices_booking_id_fkey
  foreign key (booking_id) references pw_bookings(id) on delete restrict;

alter table pw_agreements drop constraint if exists pw_agreements_booking_id_fkey;
alter table pw_agreements add constraint pw_agreements_booking_id_fkey
  foreign key (booking_id) references pw_bookings(id) on delete restrict;

alter table pw_agreements drop constraint if exists pw_agreements_refund_policy_version_fkey;
alter table pw_agreements add constraint pw_agreements_refund_policy_version_fkey
  foreign key (refund_policy_version) references pw_refund_policy(version) on delete restrict;

alter table pw_bookings drop constraint if exists pw_bookings_refund_policy_version_fkey;
alter table pw_bookings add constraint pw_bookings_refund_policy_version_fkey
  foreign key (refund_policy_version) references pw_refund_policy(version) on delete restrict;

-- ── Condition reports (append-only) ─────────────────────────────────────────
alter table pw_condition_photos drop constraint if exists pw_condition_photos_booking_id_fkey;
alter table pw_condition_photos add constraint pw_condition_photos_booking_id_fkey
  foreign key (booking_id) references pw_bookings(id) on delete restrict;
alter table pw_condition_photos drop constraint if exists pw_condition_photos_slot_id_fkey;
alter table pw_condition_photos add constraint pw_condition_photos_slot_id_fkey
  foreign key (slot_id) references pw_slots(id) on delete restrict;
alter table pw_condition_photos drop constraint if exists pw_condition_photos_uploaded_by_fkey;
alter table pw_condition_photos add constraint pw_condition_photos_uploaded_by_fkey
  foreign key (uploaded_by) references "user"(id) on delete restrict;

alter table pw_damage_records drop constraint if exists pw_damage_records_booking_id_fkey;
alter table pw_damage_records add constraint pw_damage_records_booking_id_fkey
  foreign key (booking_id) references pw_bookings(id) on delete restrict;
alter table pw_damage_records drop constraint if exists pw_damage_records_slot_id_fkey;
alter table pw_damage_records add constraint pw_damage_records_slot_id_fkey
  foreign key (slot_id) references pw_slots(id) on delete restrict;
alter table pw_damage_records drop constraint if exists pw_damage_records_photo_id_fkey;
alter table pw_damage_records add constraint pw_damage_records_photo_id_fkey
  foreign key (photo_id) references pw_condition_photos(id) on delete restrict;
alter table pw_damage_records drop constraint if exists pw_damage_records_recorded_by_fkey;
alter table pw_damage_records add constraint pw_damage_records_recorded_by_fkey
  foreign key (recorded_by) references "user"(id) on delete restrict;
-- artwork_id stays ON DELETE SET NULL (0025): erasure deletes the artwork, the record stays.

-- ── Append-only ledger / audit ──────────────────────────────────────────────
alter table pw_ledger drop constraint if exists pw_ledger_created_by_fkey;
alter table pw_ledger add constraint pw_ledger_created_by_fkey
  foreign key (created_by) references "user"(id) on delete restrict;

alter table pw_audit_log drop constraint if exists pw_audit_log_actor_id_fkey;
alter table pw_audit_log add constraint pw_audit_log_actor_id_fkey
  foreign key (actor_id) references "user"(id) on delete restrict;

-- ── Certificates, provenance, editions, mints ───────────────────────────────
alter table editions drop constraint if exists editions_artwork_id_fkey;
alter table editions add constraint editions_artwork_id_fkey
  foreign key (artwork_id) references artworks(id) on delete restrict;
alter table editions drop constraint if exists editions_user_id_fkey;
alter table editions add constraint editions_user_id_fkey
  foreign key (user_id) references "user"(id) on delete restrict;

alter table coa_certificates drop constraint if exists coa_certificates_artwork_id_fkey;
alter table coa_certificates add constraint coa_certificates_artwork_id_fkey
  foreign key (artwork_id) references artworks(id) on delete restrict;
alter table coa_certificates drop constraint if exists coa_certificates_edition_id_fkey;
alter table coa_certificates add constraint coa_certificates_edition_id_fkey
  foreign key (edition_id) references editions(id) on delete restrict;
alter table coa_certificates drop constraint if exists coa_certificates_user_id_fkey;
alter table coa_certificates add constraint coa_certificates_user_id_fkey
  foreign key (user_id) references "user"(id) on delete restrict;

alter table provenance_events drop constraint if exists provenance_events_artwork_id_fkey;
alter table provenance_events add constraint provenance_events_artwork_id_fkey
  foreign key (artwork_id) references artworks(id) on delete restrict;
alter table provenance_events drop constraint if exists provenance_events_actor_id_fkey;
alter table provenance_events add constraint provenance_events_actor_id_fkey
  foreign key (actor_id) references "user"(id) on delete restrict;

alter table mint_commitments drop constraint if exists mint_commitments_artwork_id_fkey;
alter table mint_commitments add constraint mint_commitments_artwork_id_fkey
  foreign key (artwork_id) references artworks(id) on delete restrict;
alter table mint_commitments drop constraint if exists mint_commitments_edition_id_fkey;
alter table mint_commitments add constraint mint_commitments_edition_id_fkey
  foreign key (edition_id) references editions(id) on delete restrict;
alter table mint_commitments drop constraint if exists mint_commitments_user_id_fkey;
alter table mint_commitments add constraint mint_commitments_user_id_fkey
  foreign key (user_id) references "user"(id) on delete restrict;
alter table mint_commitments drop constraint if exists mint_commitments_merkle_root_id_fkey;
alter table mint_commitments add constraint mint_commitments_merkle_root_id_fkey
  foreign key (merkle_root_id) references merkle_roots(id) on delete restrict;

-- ── Exhibitions and curators ────────────────────────────────────────────────
alter table exhibitions drop constraint if exists exhibitions_user_id_fkey;
alter table exhibitions add constraint exhibitions_user_id_fkey
  foreign key (user_id) references "user"(id) on delete restrict;
alter table exhibition_artworks drop constraint if exists exhibition_artworks_artwork_id_fkey;
alter table exhibition_artworks add constraint exhibition_artworks_artwork_id_fkey
  foreign key (artwork_id) references artworks(id) on delete cascade;

alter table curators drop constraint if exists curators_user_id_fkey;
alter table curators add constraint curators_user_id_fkey
  foreign key (user_id) references "user"(id) on delete restrict;
alter table curator_picks drop constraint if exists curator_picks_curator_id_fkey;
alter table curator_picks add constraint curator_picks_curator_id_fkey
  foreign key (curator_id) references curators(id) on delete cascade;
alter table curator_picks drop constraint if exists curator_picks_artwork_id_fkey;
alter table curator_picks add constraint curator_picks_artwork_id_fkey
  foreign key (artwork_id) references artworks(id) on delete cascade;

-- ── Tags ────────────────────────────────────────────────────────────────────
-- artwork_id RESTRICT, not SET NULL: unbinding must clear bound_at too
-- (art_tags_binding_check, 0033), which a SET NULL cannot do. Erasure and
-- deleteArtwork unbind first.
alter table art_tags drop constraint if exists art_tags_artwork_id_fkey;
alter table art_tags add constraint art_tags_artwork_id_fkey
  foreign key (artwork_id) references artworks(id) on delete restrict;
alter table art_tags drop constraint if exists art_tags_bound_by_fkey;
alter table art_tags add constraint art_tags_bound_by_fkey
  foreign key (bound_by) references "user"(id) on delete set null;
alter table art_tag_scans drop constraint if exists art_tag_scans_tag_id_fkey;
alter table art_tag_scans add constraint art_tag_scans_tag_id_fkey
  foreign key (tag_id) references art_tags(id) on delete cascade;

-- ── User-owned tables that had no FK at all ─────────────────────────────────
alter table artworks drop constraint if exists artworks_user_id_fkey;
alter table artworks add constraint artworks_user_id_fkey
  foreign key ("userId") references "user"(id) on delete restrict;

alter table session drop constraint if exists session_user_id_fkey;
alter table session add constraint session_user_id_fkey
  foreign key ("userId") references "user"(id) on delete cascade;
alter table account drop constraint if exists account_user_id_fkey;
alter table account add constraint account_user_id_fkey
  foreign key ("userId") references "user"(id) on delete cascade;

alter table contacts drop constraint if exists contacts_user_id_fkey;
alter table contacts add constraint contacts_user_id_fkey
  foreign key ("userId") references "user"(id) on delete cascade;
alter table collections drop constraint if exists collections_user_id_fkey;
alter table collections add constraint collections_user_id_fkey
  foreign key ("userId") references "user"(id) on delete cascade;
alter table tasks drop constraint if exists tasks_user_id_fkey;
alter table tasks add constraint tasks_user_id_fkey
  foreign key ("userId") references "user"(id) on delete cascade;
alter table sales drop constraint if exists sales_user_id_fkey;
alter table sales add constraint sales_user_id_fkey
  foreign key ("userId") references "user"(id) on delete cascade;
alter table documents drop constraint if exists documents_user_id_fkey;
alter table documents add constraint documents_user_id_fkey
  foreign key ("userId") references "user"(id) on delete cascade;
alter table rooms drop constraint if exists rooms_user_id_fkey;
alter table rooms add constraint rooms_user_id_fkey
  foreign key ("userId") references "user"(id) on delete cascade;
