-- 0069: artwork inquiries — a real message thread between a signed-in sender
-- and the owner of a work, and the thing that finally makes `contacts` grow by
-- itself instead of being typed in by hand (CHANGES-PLAN §8.5).
--
-- Shape: one `inquiries` row is one thread about one artwork between one
-- sender and one recipient; `inquiry_messages` holds the turns. The thread
-- carries the read/replied state because that is what an inbox lists and
-- sorts on, and recomputing it from the messages on every inbox render would
-- be a per-row aggregate for no gain.
--
-- Sending requires sign-in (decided 2026-10-15), so sender_id is NOT NULL and
-- there is no anonymous path to rate-limit or moderate. The sender's email is
-- never stored or copied here: the platform relays, and neither party ever
-- sees the other's address through this feature.
--
-- Additive only. Nothing reads these tables until the UI ships with them.

begin;

create table if not exists inquiries (
  id text primary key,
  artwork_id text not null references artworks (id) on delete cascade,
  -- Both sides are real accounts. ON DELETE CASCADE: an inquiry is
  -- correspondence, not a financial record, so it goes with the account
  -- (unlike orders, see 0066's header).
  sender_id text not null references "user" (id) on delete cascade,
  recipient_id text not null references "user" (id) on delete cascade,
  -- Denormalised onto the thread so the inbox can list and sort without
  -- joining the messages table.
  subject text not null,
  status text not null default 'open'
    check (status in ('open', 'replied', 'closed')),
  -- Set when the RECIPIENT reads the thread. Null = unread, which is what the
  -- inbox badge counts.
  read_at timestamptz,
  replied_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Nobody can inquire with themselves; that would put a thread in your own
  -- inbox from yourself.
  constraint inquiries_not_self check (sender_id <> recipient_id)
);

-- The two real access paths: "my inbox, newest first" and "what I have sent".
create index if not exists inquiries_recipient_idx
  on inquiries (recipient_id, last_message_at desc);
create index if not exists inquiries_sender_idx
  on inquiries (sender_id, last_message_at desc);
-- Rate limiting and dedupe both ask "has this person already written to me
-- about this work?".
create index if not exists inquiries_artwork_sender_idx
  on inquiries (artwork_id, sender_id);

create table if not exists inquiry_messages (
  id text primary key,
  inquiry_id text not null references inquiries (id) on delete cascade,
  -- Must be one of the thread's two participants; enforced in the action,
  -- which has the thread row to compare against.
  author_id text not null references "user" (id) on delete cascade,
  -- 2000 chars is the limit the compose box shows. Enforced here too so a
  -- direct database write cannot exceed what the UI promised.
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists inquiry_messages_thread_idx
  on inquiry_messages (inquiry_id, created_at);

-- Lets an inquiry attach itself to the contact it created, so the contact row
-- and the thread are not two unrelated records of the same person. Nullable:
-- every contact that predates this migration has no inquiry, and a contact
-- typed in by hand still never gets one.
alter table contacts add column if not exists source_inquiry_id text
  references inquiries (id) on delete set null;
-- Lets createInquiry find "do I already have a contact for this sender?"
-- without scanning the owner's whole contact book.
alter table contacts add column if not exists source_user_id text
  references "user" (id) on delete set null;
create unique index if not exists contacts_owner_source_user_idx
  on contacts ("userId", source_user_id)
  where source_user_id is not null;

commit;
