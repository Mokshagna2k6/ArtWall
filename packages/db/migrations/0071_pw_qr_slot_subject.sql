-- 0071: allow a pw_qr_tokens row whose subject is a WallOS slot.
--
-- Bible Locked Rule 21/22 + Invariant 12: a wall slot may exist with no
-- artwork, and its QR is PERMANENT and identifies the SLOT, never the artwork
-- (QR -> slot -> current exhibition -> current artwork). Before this change
-- the subject check allowed only artwork/artist/visitor/booking, so a
-- slot-bound QR could not be represented at all and the only way to put a QR
-- on a wall was to bind it to an artwork — exactly the thing Invariant 12
-- forbids.
--
-- This widens the existing CHECK by one value. It adds no resolver behaviour:
-- /q/[token] still only redirects for the four previous subject types and
-- shows its readable "we can't read this code" page for anything else, so a
-- slot QR is storable and auditable today and gains a destination when the
-- public /wall/:slotId screen is built.

begin;

alter table pw_qr_tokens drop constraint if exists pw_qr_tokens_subject_check;
alter table pw_qr_tokens add constraint pw_qr_tokens_subject_check
  check (subject_type in ('artwork', 'artist', 'visitor', 'booking', 'slot'));

commit;
