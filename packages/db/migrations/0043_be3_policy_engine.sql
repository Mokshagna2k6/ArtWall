-- 0043: PolicyEngine decision log + commission_policies (BE-3.06, BE-3.09, BE-3.10).
--
-- policy_decisions: an append-only audit trail of PolicyEngine gate calls —
-- every canPublishArtwork/canExhibit/canSecondarySell/canList/canMint result,
-- the inputs it was computed from, the reason codes, and who triggered it.
-- Written by src/features/policy/log.ts. Never updated after insert.
--
-- commission_policies: versioned, active-at-a-time commission/royalty rates,
-- replacing the interim CURATOR_COMMISSION_BPS / MINT_ROYALTY_BPS env vars
-- (BE-3.10 — no bps literal may be hardcoded in src). `kind` distinguishes the
-- rate families (curator commission, mint royalty, platform commission, ...).
-- Only one row per kind may be active at a time; a transaction writer reads
-- the active row's id and stores it on the ledger entry it produces (BE-3.09),
-- so a later policy change never re-prices a past transaction.

create table if not exists policy_decisions (
  id bigint generated always as identity primary key,
  gate text not null, -- 'canPublishArtwork' | 'canExhibit' | 'canSecondarySell' | 'canList' | 'canMint'
  subject_type text not null, -- 'artwork' | 'edition' | ...
  subject_id text,
  actor_id text,
  allowed boolean not null,
  reasons jsonb not null default '[]',
  inputs jsonb not null default '{}',
  decided_at timestamptz not null default now()
);

create index if not exists policy_decisions_subject_idx
  on policy_decisions (subject_type, subject_id, decided_at desc);
create index if not exists policy_decisions_gate_idx
  on policy_decisions (gate, decided_at desc);

-- Append-only: a decision log entry is evidence of what happened, not a
-- record to be corrected in place.
create or replace function policy_decisions_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'policy_decisions is append-only: % not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists policy_decisions_no_update on policy_decisions;
create trigger policy_decisions_no_update
  before update or delete on policy_decisions
  for each row execute function policy_decisions_append_only();

create table if not exists commission_policies (
  id text primary key,
  kind text not null, -- 'curator_commission' | 'mint_royalty' | 'platform_commission'
  rate_bps integer not null check (rate_bps >= 0 and rate_bps <= 10000),
  active boolean not null default false,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

-- At most one active policy per kind, so "the active rate for this kind" is
-- always an unambiguous single row lookup.
create unique index if not exists commission_policies_one_active_per_kind
  on commission_policies (kind) where active;

create index if not exists commission_policies_kind_idx on commission_policies (kind, created_at desc);

-- Seed the initial active rate per kind, carrying over the values the interim
-- env vars used to default to (CURATOR_COMMISSION_BPS=1000, MINT_ROYALTY_BPS=400),
-- so this migration is a storage-location change, not a rate change.
insert into commission_policies (id, kind, rate_bps, active, note)
values
  ('cpol_curator_v1', 'curator_commission', 1000, true, 'Initial rate, carried over from CURATOR_COMMISSION_BPS.'),
  ('cpol_mint_v1', 'mint_royalty', 400, true, 'Initial rate, carried over from MINT_ROYALTY_BPS.')
on conflict (id) do nothing;
