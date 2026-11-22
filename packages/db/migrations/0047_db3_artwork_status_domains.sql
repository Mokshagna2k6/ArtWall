-- 0047: Orthogonal artwork status domains (DB-3.03).
--
-- artworks.status today is a single overloaded text column defaulting to
-- "available" with exactly two live callers
-- (src/app/studio/page.tsx, src/features/marketplace/actions.ts), both only
-- ever comparing against the literal "available". Bible section 17-19 wants
-- lifecycle, commerce, exhibition and custody tracked as separate domains,
-- each independently CHECK'd, instead of packing all of that into one
-- column. Adding four new columns alongside the existing `status` (left
-- completely untouched, so neither live caller changes behavior) is the
-- non-breaking way to get there; a follow-up task can migrate the two
-- read-sites off `status` onto `commerce_status` once a real write path
-- exists for the new columns (none does yet, so there's nothing to migrate
-- data for beyond the backfill below).

begin;

alter table artworks add column if not exists lifecycle_status text not null default 'draft';
alter table artworks add column if not exists commerce_status text not null default 'unlisted';
alter table artworks add column if not exists exhibition_status text not null default 'not_exhibited';
alter table artworks add column if not exists custody_status text not null default 'with_artist';

alter table artworks drop constraint if exists artworks_lifecycle_status_check;
alter table artworks add constraint artworks_lifecycle_status_check
  check (lifecycle_status in ('draft', 'published', 'archived'));

alter table artworks drop constraint if exists artworks_commerce_status_check;
alter table artworks add constraint artworks_commerce_status_check
  check (commerce_status in ('unlisted', 'listed', 'sold', 'withdrawn'));

alter table artworks drop constraint if exists artworks_exhibition_status_check;
alter table artworks add constraint artworks_exhibition_status_check
  check (exhibition_status in ('not_exhibited', 'scheduled', 'on_display', 'returned'));

alter table artworks drop constraint if exists artworks_custody_status_check;
alter table artworks add constraint artworks_custody_status_check
  check (custody_status in ('with_artist', 'in_transit', 'at_venue', 'returned_to_artist'));

-- Backfill lifecycle/commerce from the existing overloaded column + isPublic
-- so the new domains start consistent with current reality, not blank.
update artworks set
  lifecycle_status = case when "isPublic" then 'published' else 'draft' end,
  commerce_status = case when status = 'sold' then 'sold' when status = 'archived' then 'withdrawn' else 'unlisted' end
where lifecycle_status = 'draft' and commerce_status = 'unlisted'; -- only rows still at column defaults

commit;
