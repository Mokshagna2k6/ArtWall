-- ArtWall — the physical wall (Wall Management System)
--
-- The wall inside the Ric Platter venue: a grid of physical slots an artist
-- books, a staff member installs into, and a visitor scans. Spec:
-- AWL/ENG/2026/WMS-SPEC-002, see context_for_claude_for_physical_wall/.
--
-- Everything here is prefixed `pw_` (physical wall). The site already has a
-- *digital* wall (`waitlist_entries`, /wall) and the two must never be confused
-- by someone reading a query six months from now.
--
-- MONEY IS STORED IN PAISE, as integers, and every such column says so in its
-- name. Rupee floats plus an 18% GST line plus a 10% partner discount is three
-- chances to lose a fraction of a rupee; integers have none. Convert at the
-- edges, never in the middle.
--
-- NOTE: scripts/migrate.mjs strips full-line comments and splits this file on
-- semicolons, so every statement must be a single flat statement. No
-- DO $$ ... $$ blocks, and no semicolons inside string literals.

-- ── RBAC ────────────────────────────────────────────────────────────────────
-- Four roles, per the spec. Default 'artist' because that is who signs up; the
-- first admins are promoted from ADMIN_EMAILS at sign-in. 'visitor' exists for
-- completeness but a walk-in visitor normally has no account at all (F26) — they
-- are a row in pw_visitors, not a user.
alter table "user"
  add column if not exists role text not null default 'artist';

-- Paired DROP IF EXISTS + ADD so a half-applied run can be retried. Postgres
-- has no ADD CONSTRAINT IF NOT EXISTS and the runner forbids DO blocks, so this
-- is the only way to make the statement idempotent. Same pattern everywhere a
-- constraint is added outside a CREATE TABLE in this file.
alter table "user"
  drop constraint if exists user_role_check;

alter table "user"
  add constraint user_role_check
  check (role in ('visitor', 'artist', 'staff', 'admin'));

-- ── Grid & slots (F01, F02, C01) ────────────────────────────────────────────
-- A grid is a saved layout. Exactly one is `active`; the rest are templates or
-- superseded history. Keeping old configs rather than mutating one row means a
-- booking made under the '28-slot standard' layout can still be explained.
-- `row_count`/`col_count` rather than `rows`/`cols`: ROW is a reserved word in
-- Postgres and the quoting it would force on every query is not worth it.
create table if not exists pw_grid_config (
  id           text        primary key,
  name         text        not null,
  row_count    integer     not null check (row_count between 1 and 20),
  col_count    integer     not null check (col_count between 1 and 20),
  is_template  boolean     not null default false,
  active       boolean     not null default false,
  version      integer     not null default 1,
  created_by   text        references "user"(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Only one grid may be live at a time. A partial unique index states that as a
-- database guarantee rather than an application convention.
create unique index if not exists pw_grid_config_one_active_idx
  on pw_grid_config (active)
  where active = true;

-- Physical slot sizes are a managed catalog, not an S/M/L/XL enum (C02).
-- Admin adds, renames and retires classes; retiring sets active = false so
-- historic bookings that reference the class still resolve.
create table if not exists pw_size_catalog (
  id              text        primary key,
  name            text        not null,
  w_cm            integer     not null check (w_cm > 0),
  h_cm            integer     not null check (h_cm > 0),
  weight_kg       integer     not null default 5 check (weight_kg > 0),
  base_price_paise integer    not null check (base_price_paise >= 0),
  active          boolean     not null default true,
  sort_order      integer     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Slot types carry the price multiplier (F05). A table rather than an enum for
-- the same reason as sizes: the founder changes these, not an engineer.
-- `multiplier_bp` is basis points (10000 = 1.0x) so the multiplier is an integer
-- too and pricing never touches a float.
create table if not exists pw_slot_types (
  id             text        primary key,
  label          text        not null,
  multiplier_bp  integer     not null check (multiplier_bp >= 0),
  requires_grant boolean     not null default false,
  active         boolean     not null default true,
  sort_order     integer     not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- A slot is one hanging position. `version` is an optimistic lock: two admins
-- editing the grid at once is a real scenario (F01/F02 edge cases) and
-- last-write-wins would silently discard one of them.
create table if not exists pw_slots (
  id         text        primary key,
  grid_id    text        not null references pw_grid_config(id) on delete cascade,
  row_index  integer     not null check (row_index >= 0),
  col_index  integer     not null check (col_index >= 0),
  label      text        not null,
  size_id    text        not null references pw_size_catalog(id) on delete restrict,
  type_id    text        not null references pw_slot_types(id) on delete restrict,
  state      text        not null default 'available',
  version    integer     not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pw_slots_state_check check (state in
    ('available', 'reserved', 'booked', 'received',
     'installed', 'live', 'ended', 'maintenance', 'blocked'))
);

-- No two slots may occupy the same cell. Enforced here, not in the reorder
-- action: a drag-and-drop swap is two updates and a bug between them would
-- otherwise leave the wall in a state the UI cannot render.
create unique index if not exists pw_slots_cell_idx
  on pw_slots (grid_id, row_index, col_index);

create index if not exists pw_slots_state_idx
  on pw_slots (grid_id, state);

-- ── Add-ons (F11, C03) ──────────────────────────────────────────────────────
-- Admin-managed catalog. `category` separates the Platter coffee add-ons from
-- general ones; `applies_to` gates whether an artist, a visitor or both can buy.
-- The NFC line-item from the original spec is deliberately absent (C06).
create table if not exists pw_addon_catalog (
  id          text        primary key,
  label       text        not null,
  price_paise integer     not null check (price_paise >= 0),
  applies_to  text        not null default 'artist',
  category    text        not null default 'general',
  active      boolean     not null default true,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint pw_addon_applies_to_check check (applies_to in ('artist', 'visitor', 'both')),
  constraint pw_addon_category_check check (category in ('general', 'coffee'))
);

-- ── Refund policy (C05) ─────────────────────────────────────────────────────
-- One number, versioned. Append-only: a booking snapshots the version in force
-- when it was made (F12/F20), so changing the policy tomorrow must not silently
-- rewrite what an artist agreed to today. Never UPDATE a row here — INSERT.
create table if not exists pw_refund_policy (
  version     integer     primary key generated always as identity,
  percentage  integer     not null check (percentage between 0 and 100),
  note        text,
  updated_by  text        references "user"(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ── Wall settings ───────────────────────────────────────────────────────────
-- Single row (id is pinned to 1). Every tunable the founder owns rather than an
-- engineer: hold timers, GST rate, the Platter discount rate, group discounts.
--
-- `surge_enabled` defaults FALSE. Surge pricing exists in the prototype but is
-- absent from the written spec, so it ships off until someone decides.
-- `group_discount_tiers` is seeded with invented percentages — the spec says
-- "5+/10+/full-wall tiers" and gives no numbers. Both are flagged to the founder.
create table if not exists pw_settings (
  id                    integer     primary key default 1 check (id = 1),
  hold_minutes          integer     not null default 30 check (hold_minutes > 0),
  buffer_days           integer     not null default 0 check (buffer_days >= 0),
  gst_rate_bp           integer     not null default 1800 check (gst_rate_bp >= 0),
  surge_enabled         boolean     not null default false,
  surge_threshold_pct   integer     not null default 80,
  surge_multiplier_bp   integer     not null default 11500,
  perk_discount_bp      integer     not null default 1000,
  perk_cost_bearer      text        not null default 'artwall',
  group_discount_tiers  jsonb       not null default '[]'::jsonb,
  venue_open_hour       integer     not null default 11,
  venue_close_hour      integer     not null default 22,
  updated_at            timestamptz not null default now(),
  constraint pw_settings_bearer_check check (perk_cost_bearer in ('artwall', 'platter', 'split'))
);

-- ── Bookings (F07, F08) ─────────────────────────────────────────────────────
-- `refund_policy_version` is snapshotted, not joined to "the current policy".
-- Amounts are frozen at quote time for the same reason (F03: a confirmed
-- booking keeps the price it was quoted).
create table if not exists pw_bookings (
  id                    text        primary key,
  artist_id             text        not null references "user"(id) on delete restrict,
  artwork_id            text,
  status                text        not null default 'held',
  start_date            date        not null,
  end_date              date        not null,
  duration_days         integer     not null check (duration_days > 0),
  base_amount_paise     integer     not null default 0 check (base_amount_paise >= 0),
  addon_amount_paise    integer     not null default 0 check (addon_amount_paise >= 0),
  discount_amount_paise integer     not null default 0 check (discount_amount_paise >= 0),
  gst_amount_paise      integer     not null default 0 check (gst_amount_paise >= 0),
  total_amount_paise    integer     not null default 0 check (total_amount_paise >= 0),
  surge_applied         boolean     not null default false,
  refund_policy_version integer     references pw_refund_policy(version),
  hold_expires_at       timestamptz,
  cancelled_reason      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint pw_bookings_status_check check (status in
    ('held', 'paid', 'cancelled', 'expired', 'completed', 'refunded')),
  constraint pw_bookings_dates_check check (end_date >= start_date)
);

create index if not exists pw_bookings_artist_idx
  on pw_bookings (artist_id, created_at desc);

create index if not exists pw_bookings_status_idx
  on pw_bookings (status, start_date);

-- Which slots a booking holds, and what each was quoted at. `quoted_price_paise`
-- is a copy, not a join: an admin editing the size catalog must not re-price a
-- booking that is already confirmed.
create table if not exists pw_booking_slots (
  booking_id         text    not null references pw_bookings(id) on delete cascade,
  slot_id            text    not null references pw_slots(id) on delete restrict,
  quoted_price_paise integer not null check (quoted_price_paise >= 0),
  primary key (booking_id, slot_id)
);

create index if not exists pw_booking_slots_slot_idx
  on pw_booking_slots (slot_id);

-- Add-on lines. Label and price are copied off the catalog for the same reason.
create table if not exists pw_booking_addons (
  id          text        primary key,
  booking_id  text        not null references pw_bookings(id) on delete cascade,
  addon_id    text        not null,
  label       text        not null,
  price_paise integer     not null check (price_paise >= 0),
  fulfilled   boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists pw_booking_addons_booking_idx
  on pw_booking_addons (booking_id);

-- ── Payments (F17) ──────────────────────────────────────────────────────────
-- `event_id` is unique and is the whole idempotency story: Razorpay retries
-- webhooks, and a duplicate delivery must not mark a booking paid twice or
-- write two ledger entries. No card data is ever stored here — Razorpay is the
-- PCI-scoped party and we hold references only.
create table if not exists pw_payments (
  id           text        primary key,
  booking_id   text        not null references pw_bookings(id) on delete cascade,
  provider     text        not null default 'razorpay',
  order_id     text,
  payment_id   text,
  event_id     text        unique,
  amount_paise integer     not null check (amount_paise >= 0),
  status       text        not null default 'created',
  notes        text,
  created_at   timestamptz not null default now(),
  constraint pw_payments_status_check check (status in
    ('created', 'captured', 'failed', 'refunded', 'manual'))
);

create index if not exists pw_payments_booking_idx
  on pw_payments (booking_id, created_at desc);

-- ── Ledger (F18, C07) ───────────────────────────────────────────────────────
-- Two lists, one table. Deliberately not a P&L engine — when volume justifies
-- it the answer is Tally or Zoho Books, not more tables here.
create table if not exists pw_ledger (
  id           text        primary key,
  type         text        not null,
  category     text        not null,
  amount_paise integer     not null,
  note         text,
  entry_date   date        not null default current_date,
  source_ref   text,
  created_by   text        references "user"(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint pw_ledger_type_check check (type in ('revenue', 'expense'))
);

create index if not exists pw_ledger_date_idx
  on pw_ledger (entry_date desc, type);

-- An entry generated by the system (a captured payment, a perk redemption) is
-- written once per source. Manual founder entries have a null source_ref and
-- are unconstrained.
create unique index if not exists pw_ledger_source_idx
  on pw_ledger (source_ref)
  where source_ref is not null;

-- ── Install operations (F13, F14, F15) ──────────────────────────────────────
create table if not exists pw_install_windows (
  id         text        primary key,
  booking_id text        not null references pw_bookings(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  status     text        not null default 'offered',
  created_at timestamptz not null default now(),
  constraint pw_install_windows_status_check check (status in
    ('offered', 'reserved', 'attended', 'missed', 'cancelled')),
  constraint pw_install_windows_span_check check (ends_at > starts_at)
);

create index if not exists pw_install_windows_booking_idx
  on pw_install_windows (booking_id, starts_at);

-- The checklist is jsonb because it is *derived* per booking from slot size,
-- type and add-ons (F14) — there is no fixed set of columns to model. Storing
-- the generated list means an audit can see exactly what was ticked, even after
-- the generation rules change.
create table if not exists pw_checkins (
  id                  text        primary key,
  booking_id          text        not null references pw_bookings(id) on delete cascade,
  slot_id             text        not null references pw_slots(id) on delete restrict,
  checklist           jsonb       not null default '[]'::jsonb,
  condition_photo_url text,
  condition_notes     text,
  verified_by         text        references "user"(id) on delete set null,
  verified_at         timestamptz,
  status              text        not null default 'pending',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint pw_checkins_status_check check (status in ('pending', 'verified', 'blocked'))
);

create unique index if not exists pw_checkins_booking_slot_idx
  on pw_checkins (booking_id, slot_id);

-- ── QR tokens (C06, F15, F26, F31) ──────────────────────────────────────────
-- One table for all three kinds of code: the label on an artwork, the artist's
-- coupon, the visitor's coupon. They share a resolver (/q/[token]) and a
-- revocation path, so they share a table.
--
-- The token itself is an HMAC-signed opaque string holding a subject reference —
-- never a name, phone or email. A copied QR still resolves through our server,
-- which is what makes a stolen label useless (C06 mitigation for dropping NFC).
create table if not exists pw_qr_tokens (
  token        text        primary key,
  subject_type text        not null,
  subject_id   text        not null,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  constraint pw_qr_tokens_subject_check check (subject_type in
    ('artwork', 'artist', 'visitor', 'booking'))
);

create index if not exists pw_qr_tokens_subject_idx
  on pw_qr_tokens (subject_type, subject_id);

-- ── Visitors & signals (F21, F26) ───────────────────────────────────────────
-- Consent is columns, not a flag: purpose consent is required to store the row
-- at all, marketing consent is separate and optional, and both carry the
-- timestamp that proves when they were given (DPDP s.6, no bundling).
create table if not exists pw_visitors (
  id                 text        primary key,
  name               text        not null,
  contact            text        not null,
  contact_kind       text        not null default 'phone',
  consent_purpose    boolean     not null default false,
  consent_marketing  boolean     not null default false,
  consented_at       timestamptz not null default now(),
  expires_at         timestamptz not null,
  withdrawn_at       timestamptz,
  created_at         timestamptz not null default now(),
  constraint pw_visitors_contact_kind_check check (contact_kind in ('phone', 'email')),
  constraint pw_visitors_consent_check check (consent_purpose = true)
);

create index if not exists pw_visitors_expiry_idx
  on pw_visitors (expires_at);

-- A visit is the session a scan attaches to, and the unit the Platter perk is
-- capped against ("one redemption per visit").
create table if not exists pw_visits (
  id         text        primary key,
  visitor_id text        not null references pw_visitors(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);

create index if not exists pw_visits_visitor_idx
  on pw_visits (visitor_id, started_at desc);

-- Scans deliberately carry NO IP address and no user agent (F21 data
-- minimisation). Rate limiting uses a rotating hashed key held in memory, never
-- persisted against the event. `visit_id` is nullable — most scans are anonymous.
create table if not exists pw_scans (
  id         bigint      generated always as identity primary key,
  artwork_id text        not null,
  visit_id   text        references pw_visits(id) on delete set null,
  source     text        not null default 'qr',
  created_at timestamptz not null default now()
);

create index if not exists pw_scans_artwork_idx
  on pw_scans (artwork_id, created_at desc);

create index if not exists pw_scans_visit_idx
  on pw_scans (visit_id);

-- ── Platter perk redemptions (RP01) ─────────────────────────────────────────
-- `bill_amount_paise` is the field that makes this a sale tracker rather than a
-- coupon log. It is required; a redemption recorded without one is `flagged` for
-- reconciliation rather than rejected, so a queue at the counter never stalls.
create table if not exists pw_perk_redemptions (
  id                    text        primary key,
  principal_type        text        not null,
  principal_id          text        not null,
  bill_amount_paise     integer     check (bill_amount_paise > 0),
  discount_amount_paise integer     not null default 0 check (discount_amount_paise >= 0),
  artwork_ref           text,
  visit_ref             text        references pw_visits(id) on delete set null,
  booking_ref           text        references pw_bookings(id) on delete set null,
  flagged               boolean     not null default false,
  redeemed_by           text        references "user"(id) on delete set null,
  redeemed_at           timestamptz not null default now(),
  constraint pw_perk_principal_check check (principal_type in ('artist', 'visitor'))
);

create index if not exists pw_perk_principal_idx
  on pw_perk_redemptions (principal_type, principal_id, redeemed_at desc);

-- One redemption per visit, enforced in the database rather than only in the
-- action — the counter screen can be opened twice on two phones.
create unique index if not exists pw_perk_one_per_visit_idx
  on pw_perk_redemptions (visit_ref)
  where visit_ref is not null;

create unique index if not exists pw_perk_one_per_booking_idx
  on pw_perk_redemptions (booking_ref)
  where booking_ref is not null;

-- ── Audit log ───────────────────────────────────────────────────────────────
-- Append-only, and the reason RBAC had to be real rather than a shared password:
-- "an admin did this" is not an accountable record, "this admin did this" is.
create table if not exists pw_audit_log (
  id           bigint      generated always as identity primary key,
  actor_id     text        references "user"(id) on delete set null,
  actor_label  text,
  action       text        not null,
  subject_type text        not null,
  subject_id   text,
  before       jsonb,
  after        jsonb,
  at           timestamptz not null default now()
);

create index if not exists pw_audit_log_subject_idx
  on pw_audit_log (subject_type, subject_id, at desc);

create index if not exists pw_audit_log_at_idx
  on pw_audit_log (at desc);

-- ── Artwork link ────────────────────────────────────────────────────────────
-- Reuses the existing `artworks` table rather than creating a second one: an
-- artist's catalogue entry and the piece hanging on the wall are the same work,
-- and duplicating it would mean two titles that can drift apart.
alter table artworks
  add column if not exists "physicalStatus" text,
  add column if not exists "qrToken" text;

create index if not exists artworks_physical_status_idx
  on artworks ("physicalStatus")
  where "physicalStatus" is not null;

alter table pw_bookings
  drop constraint if exists pw_bookings_artwork_fkey;

alter table pw_bookings
  add constraint pw_bookings_artwork_fkey
  foreign key (artwork_id) references artworks(id) on delete set null;
