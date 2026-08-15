-- ArtWall — consent, agreements, waitlist, grievances
--
-- Closes the four gaps that make the physical wall lawful to launch rather than
-- merely functional (spec §5.2, §5.3, §5.4, F20, F10/C04):
--
--   * pw_consents     — the Consent Manager record the DPDP Act expects: every
--                       processing purpose tied to the consent that authorises
--                       it, itemised and independently withdrawable.
--   * pw_agreements   — the exhibition agreement, hash-sealed at signature so
--                       the version signed can be proven later (IT Act §6).
--   * pw_waitlist     — the priority queue, plus an override log so a manual
--                       reorder is accountable rather than mysterious.
--   * pw_grievances   — the in-product grievance channel, with a clock on it.
--
-- NOTE: scripts/migrate.mjs strips full-line comments and splits on semicolons,
-- so every statement must be flat. No DO $$ ... $$ blocks.

-- ── Artist account facts (F31) ──────────────────────────────────────────────
-- Founding status is claimed, not assumed. Verification is a separate axis from
-- it: an unverified artist may exhibit but not be paid, which is exactly what
-- the spec says and why one boolean could not carry both.
alter table "user"
  add column if not exists "foundingMember" boolean not null default false,
  add column if not exists "verifiedAt" timestamptz,
  add column if not exists "verificationMethod" text,
  add column if not exists "ageDeclaredAdult" boolean,
  add column if not exists "onboardedAt" timestamptz,
  add column if not exists "nomineeName" text,
  add column if not exists "nomineeContact" text;

-- ── Consent Manager (§5.2) ──────────────────────────────────────────────────
-- One row per person per purpose. Purposes are separate rows rather than
-- columns because that is what "no bundling" means structurally: withdrawing
-- marketing cannot touch the account consent if they are different rows, and a
-- new purpose is a new row rather than a migration plus a default that silently
-- grants something nobody agreed to.
--
-- Rows are never deleted on withdrawal — `withdrawn_at` is set. The record that
-- consent *was* held, and when it ended, is the evidence the Act asks for.
create table if not exists pw_consents (
  id            text        primary key,
  user_id       text        references "user"(id) on delete cascade,
  visitor_id    text        references pw_visitors(id) on delete cascade,
  purpose       text        not null,
  granted       boolean     not null default true,
  notice_version text       not null default 'v1',
  granted_at    timestamptz not null default now(),
  withdrawn_at  timestamptz,
  constraint pw_consents_purpose_check check (purpose in
    ('account', 'marketing', 'profile_publication', 'ugc_publication')),
  constraint pw_consents_subject_check check (
    (user_id is not null and visitor_id is null) or
    (user_id is null and visitor_id is not null)
  )
);

-- One live consent per person per purpose. A withdrawn row stays as history,
-- so the partial index only constrains the ones still in force.
create unique index if not exists pw_consents_live_user_idx
  on pw_consents (user_id, purpose)
  where withdrawn_at is null and user_id is not null;

create unique index if not exists pw_consents_live_visitor_idx
  on pw_consents (visitor_id, purpose)
  where withdrawn_at is null and visitor_id is not null;

-- ── Exhibition agreement (F20) ──────────────────────────────────────────────
-- `terms_hash` is a SHA-256 of the exact text shown to the artist. Storing the
-- body *and* its hash means a dispute is settled by recomputation rather than
-- by trusting our own database: if the stored body hashes to the stored hash,
-- that is what was signed.
--
-- Immutable by convention and by the absence of any update path in the app —
-- a revised agreement is a new row against a new booking, never an edit.
create table if not exists pw_agreements (
  id                    text        primary key,
  booking_id            text        not null references pw_bookings(id) on delete cascade,
  artist_id             text        not null references "user"(id) on delete restrict,
  terms_version         text        not null,
  terms_hash            text        not null,
  body                  text        not null,
  refund_policy_version integer     references pw_refund_policy(version),
  total_amount_paise    integer     not null,
  signed_name           text        not null,
  signed_at             timestamptz not null default now()
);

-- One agreement per booking. A second signature on the same booking would make
-- "which terms govern" ambiguous, which is the one thing this table exists to
-- prevent.
create unique index if not exists pw_agreements_booking_idx
  on pw_agreements (booking_id);

create index if not exists pw_agreements_artist_idx
  on pw_agreements (artist_id, signed_at desc);

-- ── Waitlist and queue (F10, C04) ───────────────────────────────────────────
-- `priority_rank` is an integer an admin can set directly. The automatic tier
-- (founding > repeat > referred > new) computes a default, and a manual
-- override sits above it — which is the spec's rule, made explicit as a column
-- rather than implied by sort order.
create table if not exists pw_waitlist (
  id               text        primary key,
  artist_id        text        references "user"(id) on delete set null,
  name             text        not null,
  contact          text        not null,
  city             text,
  medium           text,
  size_pref        text,
  note             text,
  tier             text        not null default 'new',
  priority_rank    integer,
  status           text        not null default 'queued',
  matched_slot_id  text        references pw_slots(id) on delete set null,
  offer_expires_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint pw_waitlist_tier_check check (tier in ('founding', 'repeat', 'referred', 'new')),
  constraint pw_waitlist_status_check check (status in
    ('queued', 'offered', 'converted', 'expired', 'removed'))
);

create index if not exists pw_waitlist_queue_idx
  on pw_waitlist (status, priority_rank asc nulls last, created_at asc);

-- An artist may hold one live place in the queue, not five.
create unique index if not exists pw_waitlist_one_live_idx
  on pw_waitlist (artist_id)
  where status in ('queued', 'offered') and artist_id is not null;

-- Every manual intervention in the queue, with who and why. The queue decides
-- who gets a wall; a reorder nobody can explain is how that becomes a rumour.
create table if not exists pw_queue_overrides (
  id          text        primary key,
  waitlist_id text        not null references pw_waitlist(id) on delete cascade,
  action      text        not null,
  actor_id    text        references "user"(id) on delete set null,
  note        text,
  at          timestamptz not null default now()
);

create index if not exists pw_queue_overrides_waitlist_idx
  on pw_queue_overrides (waitlist_id, at desc);

-- ── Grievances (§5.3) ───────────────────────────────────────────────────────
-- The Act requires a channel to a named contact with a time-bound response, so
-- `due_at` is a column rather than a policy in a document nobody opens.
create table if not exists pw_grievances (
  id           text        primary key,
  user_id      text        references "user"(id) on delete set null,
  contact      text        not null,
  subject      text        not null,
  body         text        not null,
  status       text        not null default 'open',
  due_at       timestamptz not null,
  response     text,
  responded_by text        references "user"(id) on delete set null,
  responded_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint pw_grievances_status_check check (status in ('open', 'answered', 'closed'))
);

create index if not exists pw_grievances_open_idx
  on pw_grievances (status, due_at asc);
