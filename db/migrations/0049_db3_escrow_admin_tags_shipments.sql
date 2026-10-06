-- 0049: Escrow (DB-3.09), admin roles (DB-3.10), crypto tag binding (DB-3.11),
-- shipments (DB-3.15).
--
-- No `orders` table exists in this codebase yet — pw_bookings is the closest
-- existing "order" concept (a paid booking of wall space) and pw_ledger is
-- the existing ledger. Escrow holds/releases and shipments link to
-- pw_bookings + pw_ledger rather than a speculative orders table that would
-- have no writer.
--
-- Crypto tags: art_tags (0010-ish) already stores tag_uid/bound_at/scan_count
-- for the QR/NFC binding flow DB-3.01 reads physicalBindingVerified from.
-- DB-3.11 additionally wants an NTAG424 key *reference* (never the key
-- itself) and the SUN (Secure Unique NFC) counter's last-seen value, for the
-- cryptographic (not just QR) tag flow — added as nullable columns on the
-- same table rather than a parallel one, since a tag is one row regardless
-- of whether it is QR-only or also NTAG424-capable.

begin;

-- ── DB-3.09: Escrow ─────────────────────────────────────────────────────────

create table if not exists escrow_holds (
  id text primary key,
  booking_id text not null references pw_bookings (id) on delete restrict,
  amount_paise integer not null check (amount_paise >= 0),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists escrow_holds_booking_idx on escrow_holds (booking_id);

create table if not exists escrow_releases (
  id text primary key,
  escrow_hold_id text not null references escrow_holds (id) on delete restrict,
  -- Deliberately not an FK to pw_ledger: pw_ledger (0028) is append-only and
  -- a DB-2.01 invariant test TRUNCATEs it under a privileged grant to prove
  -- the trigger (not just the ACL) stops it — Postgres refuses to TRUNCATE
  -- any table a live FK references, regardless of ON DELETE, which would
  -- make that invariant untestable the way it is written today. The ledger
  -- row id is still recorded for lookups; it is just not FK-enforced.
  ledger_id text,
  amount_paise integer not null check (amount_paise >= 0),
  released_to text,
  released_at timestamptz not null default now()
);

create index if not exists escrow_releases_ledger_idx on escrow_releases (ledger_id) where ledger_id is not null;

create index if not exists escrow_releases_hold_idx on escrow_releases (escrow_hold_id);

-- A hold's releases may never exceed the hold's own amount. Checked with a
-- trigger (not a CHECK) since it is an aggregate over sibling rows, which a
-- row-level CHECK cannot express.
create or replace function escrow_releases_within_hold() returns trigger
language plpgsql as $$
declare
  hold_amount integer;
  released_so_far integer;
begin
  select amount_paise into hold_amount from escrow_holds where id = new.escrow_hold_id;
  select coalesce(sum(amount_paise), 0) into released_so_far
    from escrow_releases where escrow_hold_id = new.escrow_hold_id and id <> new.id;
  if released_so_far + new.amount_paise > hold_amount then
    raise exception 'escrow_releases: total released (%) would exceed hold % (%)',
      released_so_far + new.amount_paise, new.escrow_hold_id, hold_amount
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists escrow_releases_check_total on escrow_releases;
create trigger escrow_releases_check_total
  before insert or update on escrow_releases
  for each row execute function escrow_releases_within_hold();

-- ── DB-3.10: Admin roles ────────────────────────────────────────────────────

create table if not exists admin_roles (
  id text primary key,
  name text not null unique,
  description text
);

insert into admin_roles (id, name, description) values
  ('role_super_admin', 'super_admin', 'Full platform control.'),
  ('role_curator_admin', 'curator_admin', 'Curation and exhibition approvals.'),
  ('role_venue_admin', 'venue_admin', 'Physical wall / venue operations.'),
  ('role_finance_admin', 'finance_admin', 'Ledger, payouts, commission policy.'),
  ('role_support_admin', 'support_admin', 'Grievances, customer support actions.'),
  ('role_compliance_admin', 'compliance_admin', 'DPDP, KYC, identity verification review.'),
  ('role_content_admin', 'content_admin', 'Artwork moderation, UGC moderation.'),
  ('role_readonly_admin', 'readonly_admin', 'Read-only dashboard access, no write actions.')
on conflict (id) do nothing;

create table if not exists admin_role_assignments (
  id text primary key,
  user_id text not null,
  role_id text not null references admin_roles (id) on delete restrict,
  granted_by text,
  granted_at timestamptz not null default now(),
  revoked_by text,
  revoked_at timestamptz
);

create unique index if not exists admin_role_assignments_live_idx
  on admin_role_assignments (user_id, role_id) where revoked_at is null;

-- Grants/revocations audit trail: append-only, same convention as
-- policy_decisions/demand_signals. A revocation is recorded by setting
-- revoked_by/revoked_at on the live assignment row (one controlled field,
-- same shape pw_consents and commission_policy_versions use for their own
-- single closing-out column), not a correction of who/when it was granted.
create or replace function admin_role_assignments_append_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'admin_role_assignments is append-only: delete not permitted' using errcode = 'restrict_violation';
  end if;
  if new.user_id is distinct from old.user_id
    or new.role_id is distinct from old.role_id
    or new.granted_by is distinct from old.granted_by
    or new.granted_at is distinct from old.granted_at
  then
    raise exception 'admin_role_assignments is append-only: only revoked_by/revoked_at may be set'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists admin_role_assignments_no_mutate on admin_role_assignments;
create trigger admin_role_assignments_no_mutate
  before update or delete on admin_role_assignments
  for each row execute function admin_role_assignments_append_only();

-- ── DB-3.11: Cryptographic tag binding ─────────────────────────────────────
-- NTAG424 key *reference* only (never the key itself, per the Bible's
-- security model) + SUN counter last-seen value + binding status, added to
-- the existing art_tags table.

alter table art_tags add column if not exists key_reference text;
alter table art_tags add column if not exists sun_counter_last_seen integer;
alter table art_tags add column if not exists binding_status text not null default 'unbound';

alter table art_tags drop constraint if exists art_tags_binding_status_check;
alter table art_tags add constraint art_tags_binding_status_check
  check (binding_status in ('unbound', 'bound', 'revoked'));

alter table art_tags drop constraint if exists art_tags_sun_counter_check;
alter table art_tags add constraint art_tags_sun_counter_check
  check (sun_counter_last_seen is null or sun_counter_last_seen >= 0);

update art_tags set binding_status = case when bound_at is not null then 'bound' else 'unbound' end
where binding_status = 'unbound'; -- only rows still at the column default

-- ── DB-3.15: Shipments (Shiprocket) ─────────────────────────────────────────

create table if not exists shipments (
  id text primary key,
  booking_id text references pw_bookings (id) on delete restrict,
  provider text not null default 'shiprocket',
  provider_shipment_id text,
  status text not null default 'created',
  tracking_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table shipments drop constraint if exists shipments_status_check;
alter table shipments add constraint shipments_status_check
  check (status in ('created', 'pickup_scheduled', 'in_transit', 'delivered', 'cancelled', 'failed'));

create index if not exists shipments_booking_idx on shipments (booking_id);

create table if not exists shipment_events (
  id bigint generated always as identity primary key,
  shipment_id text not null references shipments (id) on delete restrict,
  event_type text not null,
  payload jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create index if not exists shipment_events_shipment_idx on shipment_events (shipment_id, occurred_at desc);

create or replace function shipment_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'shipment_events is append-only: % not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists shipment_events_no_update on shipment_events;
create trigger shipment_events_no_update
  before update or delete on shipment_events
  for each row execute function shipment_events_append_only();

commit;
