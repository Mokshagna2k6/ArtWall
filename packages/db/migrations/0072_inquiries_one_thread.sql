-- 0072: one inquiry thread per (artwork, sender).
--
-- createInquiry looked for an existing thread and then inserted one if it
-- found none. Two requests from the same sender on the same artwork can
-- interleave between those two statements, so both find nothing and both
-- insert: the artist's conversation is then split across two threads, the
-- unread flag lives on only one of them, and replies land in whichever the
-- reader happened to open.
--
-- 0069 already relies on this shape — contacts has
-- contacts_owner_source_user_idx and attachContact inserts with
-- onConflictDoNothing against it. This gives inquiries the same guarantee so
-- the action can use onConflictDoUpdate instead of check-then-insert.
--
-- Dedupe before the index: an existing pair would make the create fail.
-- Keeps the oldest thread (first contact), moves its messages onto it, and
-- deletes the duplicates. Messages are never dropped.

begin;

with ranked as (
  select id,
         first_value(id) over (
           partition by artwork_id, sender_id order by created_at, id
         ) as keep_id
  from inquiries
)
update inquiry_messages m
   set inquiry_id = r.keep_id
  from ranked r
 where m.inquiry_id = r.id
   and r.id <> r.keep_id;

with ranked as (
  select id,
         first_value(id) over (
           partition by artwork_id, sender_id order by created_at, id
         ) as keep_id
  from inquiries
)
delete from inquiries i
 using ranked r
 where i.id = r.id
   and r.id <> r.keep_id;

-- 0069 already created a NON-unique index under this exact name, and
-- `create unique index if not exists` matches on the name alone: it would
-- find that index, do nothing, and leave duplicates possible while looking
-- like it had worked. Drop it by name first, then create the unique one.
drop index if exists inquiries_artwork_sender_idx;

create unique index inquiries_artwork_sender_idx
  on inquiries (artwork_id, sender_id);

commit;
