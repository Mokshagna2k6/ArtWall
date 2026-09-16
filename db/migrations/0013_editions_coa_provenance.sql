-- 0013: Editions, COA certificates, provenance events, mint commitments, merkle roots
-- Phase 2 data model (Bible §6–10, §18–19)

-- Editions: unique, limited, open, artist proof
create table if not exists editions (
  id            text primary key,
  artwork_id    text not null references artworks(id),
  user_id       text not null references "user"(id),
  edition_type  text not null default 'unique'
                check (edition_type in ('unique','limited','open')),
  edition_number integer,
  total_editions integer,
  is_ap         boolean not null default false,
  status        text not null default 'draft'
                check (status in ('draft','active','sold_out','archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_editions_artwork on editions(artwork_id);
create index if not exists idx_editions_user on editions(user_id);

-- COA certificates
create table if not exists coa_certificates (
  id             text primary key,
  artwork_id     text not null references artworks(id),
  edition_id     text references editions(id),
  user_id        text not null references "user"(id),
  metadata_hash  text not null,
  version        integer not null default 1,
  pdf_url        text,
  status         text not null default 'draft'
                 check (status in ('draft','issued','revoked')),
  issued_at      timestamptz,
  revoked_at     timestamptz,
  revoke_reason  text,
  created_at     timestamptz not null default now()
);
create unique index if not exists idx_coa_hash on coa_certificates(metadata_hash);
create index if not exists idx_coa_artwork on coa_certificates(artwork_id);

-- Provenance events (append-only)
create table if not exists provenance_events (
  id           text primary key,
  artwork_id   text not null references artworks(id),
  event_type   text not null
               check (event_type in ('created','certified','bound','exhibited','sold','transferred','minted')),
  actor_id     text references "user"(id),
  label        text,
  metadata     jsonb,
  tx_hash      text,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists idx_prov_artwork on provenance_events(artwork_id);
create index if not exists idx_prov_type on provenance_events(event_type);

-- Merkle roots (daily batch anchoring)
create table if not exists merkle_roots (
  id           text primary key,
  root_hash    text not null unique,
  tx_hash      text,
  chain_id     integer,
  block_number bigint,
  leaf_count   integer not null default 0,
  status       text not null default 'pending'
               check (status in ('pending','submitted','confirmed','failed')),
  created_at   timestamptz not null default now()
);

-- Mint commitments (lazy mint pattern)
create table if not exists mint_commitments (
  id                 text primary key,
  artwork_id         text not null references artworks(id),
  edition_id         text references editions(id),
  user_id            text not null references "user"(id),
  leaf_hash          text not null unique,
  wallet_address     text,
  erc2981_royalty_bps integer not null default 400,
  status             text not null default 'pending'
                     check (status in ('pending','committed','minted','failed')),
  merkle_root_id     text references merkle_roots(id),
  token_id           text,
  mint_tx_hash       text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_mint_artwork on mint_commitments(artwork_id);
create index if not exists idx_mint_status on mint_commitments(status);

-- Wallet address on artist_profiles
alter table artist_profiles add column if not exists wallet_address text;

-- Marketplace: exhibitions table
create table if not exists exhibitions (
  id           text primary key,
  user_id      text not null references "user"(id),
  title        text not null,
  description  text,
  venue        text,
  start_date   date,
  end_date     date,
  status       text not null default 'draft'
               check (status in ('draft','published','past','cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Exhibition artworks (many-to-many)
create table if not exists exhibition_artworks (
  exhibition_id text not null references exhibitions(id) on delete cascade,
  artwork_id    text not null references artworks(id),
  display_order integer not null default 0,
  primary key (exhibition_id, artwork_id)
);

-- Curator accounts
create table if not exists curators (
  id              text primary key,
  user_id         text not null references "user"(id) unique,
  display_name    text not null,
  bio             text,
  commission_bps  integer not null default 1000,
  status          text not null default 'pending'
                  check (status in ('pending','active','suspended')),
  created_at      timestamptz not null default now()
);

-- Curator-artwork recommendations
create table if not exists curator_picks (
  id          text primary key,
  curator_id  text not null references curators(id),
  artwork_id  text not null references artworks(id),
  note        text,
  created_at  timestamptz not null default now()
);
create unique index if not exists idx_curator_pick_unique on curator_picks(curator_id, artwork_id);

-- ArtQR / NFC tag binding
create table if not exists art_tags (
  id           text primary key,
  artwork_id   text references artworks(id),
  tag_type     text not null default 'qr'
               check (tag_type in ('qr','nfc')),
  tag_uid      text not null unique,
  bound_by     text references "user"(id),
  bound_at     timestamptz,
  scan_count   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_art_tags_artwork on art_tags(artwork_id);

-- Tag scan log
create table if not exists art_tag_scans (
  id         text primary key,
  tag_id     text not null references art_tags(id),
  scanned_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  location   jsonb
);
create index if not exists idx_tag_scans_tag on art_tag_scans(tag_id);

-- Marketplace: artwork categories for discovery
alter table artworks add column if not exists category text;
alter table artworks add column if not exists price_paise integer;
alter table artworks add column if not exists tags text[];
