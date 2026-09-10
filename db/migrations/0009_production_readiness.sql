-- ArtWall — production readiness (Phases 1–5)
--
-- Tables for: notifications, grievance responses, condition photos, damage
-- records, GST invoices, ledger locks, UGC submissions, search logs, identity
-- verification and retention runs.
--
-- Same rules as every migration here: money in paise, flat statements only
-- (scripts/migrate.mjs splits on semicolons), no personal data a purpose does
-- not require.

-- ── Notifications (Phase 1) ──────────────────────────────────────────────────
-- A queue, not a side effect. Anything that wants to tell someone something
-- inserts here; delivery happens out of band. If the mail provider is down the
-- row waits and retries — a booking must never fail because an email did.
create table if not exists pw_notifications (
  id          text        primary key,
  user_id     text        references "user"(id) on delete set null,
  channel     text        not null default 'email',
  recipient   text        not null,
  subject     text        not null,
  body        text        not null,
  kind        text        not null,
  status      text        not null default 'pending',
  attempts    integer     not null default 0 check (attempts >= 0),
  last_error  text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint pw_notifications_status_check check (
    status in ('pending', 'sent', 'failed', 'suppressed')
  ),
  constraint pw_notifications_channel_check check (channel in ('email', 'sms', 'in_app'))
);

create index if not exists pw_notifications_pending_idx
  on pw_notifications (status, created_at asc);
create index if not exists pw_notifications_user_idx
  on pw_notifications (user_id, created_at desc);

-- ── Grievance responses (Phase 1) ────────────────────────────────────────────
-- A thread, not a single overwrite: the artist's complaint and every reply stay
-- readable together, which is what "grievance redressal" means in practice.
create table if not exists pw_grievance_responses (
  id           text        primary key,
  grievance_id text        not null references pw_grievances(id) on delete cascade,
  author_id    text        references "user"(id) on delete set null,
  body         text        not null,
  created_at   timestamptz not null default now()
);

create index if not exists pw_grievance_responses_grievance_idx
  on pw_grievance_responses (grievance_id, created_at asc);

-- ── Condition photos + damage records (Phase 1/2) ────────────────────────────
-- Photos taken at install/de-install time, attached to checklist items.
-- Cloudinary public ids only — the binary lives with the processor.
create table if not exists pw_condition_photos (
  id            text        primary key,
  booking_id    text        not null references pw_bookings(id) on delete cascade,
  slot_id       text        references pw_slots(id) on delete set null,
  item_key      text        not null,
  cloudinary_id text        not null,
  url           text        not null,
  uploaded_by   text        references "user"(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists pw_condition_photos_booking_idx
  on pw_condition_photos (booking_id, item_key);

-- A failed mandatory checklist item becomes a record, not a shrug. These feed
-- the deposit conversation and the venue's own maintenance list.
create table if not exists pw_damage_records (
  id          text        primary key,
  booking_id  text        not null references pw_bookings(id) on delete cascade,
  slot_id     text        references pw_slots(id) on delete set null,
  item_key    text        not null,
  description text        not null,
  severity    text        not null default 'minor',
  photo_id    text        references pw_condition_photos(id) on delete set null,
  recorded_by text        references "user"(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint pw_damage_severity_check check (severity in ('minor', 'major'))
);

create index if not exists pw_damage_records_booking_idx
  on pw_damage_records (booking_id);

-- ── GST invoices (Phase 3) ───────────────────────────────────────────────────
-- One invoice per booking, immutable once issued. Corrections are credit notes
-- against it, never edits — the number on a sent invoice cannot change.
create table if not exists pw_invoices (
  id               text        primary key,
  booking_id       text        not null references pw_bookings(id) on delete cascade,
  number           text        not null,
  issue_date       date        not null,
  place_of_supply  text        not null,
  hsn_sac          text        not null,
  gstin_supplier   text        not null,
  gstin_customer   text,
  net_paise        integer     not null check (net_paise >= 0),
  cgst_paise       integer     not null check (cgst_paise >= 0),
  sgst_paise       integer     not null check (sgst_paise >= 0),
  total_paise      integer     not null check (total_paise >= 0),
  line_items       jsonb       not null,
  status           text        not null default 'issued',
  created_by       text        references "user"(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint pw_invoice_status_check check (status in ('issued', 'cancelled')),
  constraint pw_invoice_split_check check (total_paise = net_paise + cgst_paise + sgst_paise)
);

create unique index if not exists pw_invoices_number_idx
  on pw_invoices (number);
create unique index if not exists pw_invoices_booking_idx
  on pw_invoices (booking_id);
create index if not exists pw_invoices_date_idx
  on pw_invoices (issue_date);

-- ── Ledger period locks (Phase 3) ────────────────────────────────────────────
-- A locked month is immutable. Corrections after locking are adjustment rows
-- that reference the month, never rewrites of history.
create table if not exists pw_ledger_locks (
  month      text        primary key,
  locked_by  text        references "user"(id) on delete set null,
  locked_at  timestamptz not null default now()
);

-- ── UGC submissions (F25 / F30) ──────────────────────────────────────────────
-- Consent-gated selfies and community gallery content. Nothing is public until
-- a moderator approves it, and withdrawal removes it from delivery immediately.
create table if not exists pw_ugc_submissions (
  id             text        primary key,
  artwork_id     text        references artworks(id) on delete set null,
  user_id        text        references "user"(id) on delete set null,
  visitor_id     text,
  kind           text        not null default 'selfie',
  cloudinary_id  text        not null,
  url            text        not null,
  consent_id     text        not null,
  status         text        not null default 'pending',
  moderator_id   text        references "user"(id) on delete set null,
  moderation_note text,
  reported_count integer     not null default 0 check (reported_count >= 0),
  withdrawn_at   timestamptz,
  removed_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint pw_ugc_kind_check check (kind in ('selfie', 'community')),
  constraint pw_ugc_status_check check (
    status in ('pending', 'approved', 'rejected')
  )
);

create index if not exists pw_ugc_gallery_idx
  on pw_ugc_submissions (kind, status, created_at desc)
  where status = 'approved' and withdrawn_at is null and removed_at is null;
create index if not exists pw_ugc_moderation_idx
  on pw_ugc_submissions (status, created_at asc)
  where status = 'pending';

-- ── Search log (F28) ─────────────────────────────────────────────────────────
-- What people looked for, with no identifier attached. This is demand signal,
-- not surveillance: no user id, no IP, nothing to join back to a person.
create table if not exists pw_search_log (
  id         text        primary key,
  query      text        not null,
  results    integer     not null default 0,
  filters    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pw_search_log_query_idx
  on pw_search_log (query, created_at desc);

-- Full-text index over the searchable surface. tsvector maintained by trigger
-- so indexing stays synchronous with writes without a separate worker.
alter table artworks add column if not exists search_tsv tsvector;

create index if not exists artworks_search_idx
  on artworks using gin (search_tsv);

-- ── Identity verification (F31 / Phase 5) ────────────────────────────────────
-- Artists may exhibit unverified but cannot be paid until this clears. The
-- document reference is a Cloudinary id of the upload, reviewed by a person.
create table if not exists pw_identity_verifications (
  id            text        primary key,
  user_id       text        not null references "user"(id) on delete cascade,
  doc_cloudinary_id text    not null,
  doc_kind      text        not null default 'government_id',
  status        text        not null default 'pending',
  reviewer_id   text        references "user"(id) on delete set null,
  review_note   text,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint pw_identity_status_check check (
    status in ('pending', 'approved', 'rejected')
  )
);

create unique index if not exists pw_identity_one_pending_idx
  on pw_identity_verifications (user_id)
  where status = 'pending';
create index if not exists pw_identity_user_idx
  on pw_identity_verifications (user_id, created_at desc);

-- Verified flag on the user row itself, so payout gating is one read.
alter table "user" add column if not exists identity_verified boolean not null default false;

-- ── Retention runs (Phase 5) ─────────────────────────────────────────────────
-- Every sweep records what it did, so "we delete old data" is auditable fact.
create table if not exists pw_retention_runs (
  id          text        primary key,
  target      text        not null,
  deleted     integer     not null default 0,
  details     jsonb,
  ran_at      timestamptz not null default now()
);

create index if not exists pw_retention_runs_target_idx
  on pw_retention_runs (target, ran_at desc);