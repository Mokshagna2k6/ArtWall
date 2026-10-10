-- 0051: Exhibition lifecycle CHECK + append-only transitions history (DB-3.08).
--
-- The Bible (section 40-41) is not available verbatim in this repo, and no
-- "15 lifecycle stages" list is documented anywhere in docs/ or src/. The
-- only exhibition status values live code actually uses today are 'draft'
-- (the column default, src/features/exhibitions/actions.ts createExhibition/
-- deleteExhibition) and 'published' (publishExhibition) — both kept as-is
-- below so no existing caller breaks.
--
-- The remaining 13 stages are invented here to round out a plausible real
-- exhibition lifecycle (submission -> curator review, with a revision loop
-- and a rejection off-ramp -> scheduling -> install -> live -> wind-down ->
-- archive, plus cancellation/withdrawal as separate terminal off-ramps from
-- anywhere before 'published'). This business logic is this migration's own
-- invention, not sourced from the Bible, and is called out as such in the
-- task report. The 15 stages, in their typical order:
--
--   1. draft               - being assembled by the curator/artist. (existing)
--   2. submitted           - handed to review, no further edits by the submitter.
--   3. under_review        - a reviewer is actively looking at it.
--   4. changes_requested   - sent back for a revision; returns to draft-like editing.
--   5. approved            - review passed, not yet scheduled.
--   6. rejected            - review failed. Terminal.
--   7. scheduled           - a venue/date window is locked in.
--   8. installing          - artworks/slots are being physically set up.
--   9. published           - live and visitor-facing. (existing name, same
--                            meaning as the Bible's "live" stage.)
--  10. paused              - temporarily taken down without ending the run.
--  11. ending              - wind-down window, still visible but closing.
--  12. ended               - run is over, no longer visitor-facing.
--  13. archived            - ended and retained for record-keeping. Terminal.
--  14. cancelled           - called off before ever publishing. Terminal.
--  15. withdrawn           - pulled by the submitter after submission, before
--                            publishing. Terminal.
--
-- exhibition_transitions is append-only, same convention as policy_decisions
-- (0043) / shipment_events (0049): a trigger rejects update and delete
-- outright, and the privileged migration role's own grants are left alone
-- so even a superuser-ish app role cannot mutate history, only add to it.

begin;

alter table exhibitions drop constraint if exists exhibitions_status_check;
alter table exhibitions add constraint exhibitions_status_check
  check (status in (
    'draft', 'submitted', 'under_review', 'changes_requested', 'approved',
    'rejected', 'scheduled', 'installing', 'published', 'paused', 'ending',
    'ended', 'archived', 'cancelled', 'withdrawn'
  ));

create table if not exists exhibition_transitions (
  id bigint generated always as identity primary key,
  exhibition_id text not null references exhibitions (id) on delete restrict,
  from_status text,
  to_status text not null,
  actor_id text,
  note text,
  transitioned_at timestamptz not null default now()
);

create index if not exists exhibition_transitions_exhibition_idx
  on exhibition_transitions (exhibition_id, transitioned_at desc);

create or replace function exhibition_transitions_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'exhibition_transitions is append-only: % not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists exhibition_transitions_no_update on exhibition_transitions;
create trigger exhibition_transitions_no_update
  before update or delete on exhibition_transitions
  for each row execute function exhibition_transitions_append_only();

commit;
