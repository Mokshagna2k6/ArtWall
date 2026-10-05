-- 0044: NTAG424/SUN crypto binding state for art_tags (BC-3.09, BC-3.10, BC-3.13).
--
-- Three additions, all opaque references or verification state — never raw
-- key material (that lives in the KMS boundary, src/lib/blockchain/kms.ts):
--
--   key_reference       the KMS key reference for this tag's diversified
--                        AES-128 keys (art_tags.keyReference). Null for a
--                        'qr'-type tag (QR tags use the Ed25519 signing key
--                        in qr-signing.ts instead, not a per-tag KMS key).
--   sun_counter_last_seen  the highest NTAG424 SDM read counter this server
--                        has accepted for this tag — the replay-rejection
--                        high-water mark ntag424.ts's verifySunMessage
--                        compares against. Null until the first real verified
--                        scan.
--   binding_status       the provisioning/binding lifecycle state (BC-3.13):
--                        'unprovisioned' (row exists, no KMS key yet) ->
--                        'provisioned' (KMS key issued, not yet bound to an
--                        artwork) -> 'bound' (bound to an artwork, ownership
--                        verified) -> 'revoked' (a compromised/lost tag,
--                        never reused). Distinct from the pre-existing
--                        bound_at/artwork_id pair, which only tell you
--                        *whether* a tag is linked to an artwork right now —
--                        this column is the provisioning state machine that
--                        decides whether the tag's keys may be used at all.

alter table art_tags add column if not exists key_reference text;
alter table art_tags add column if not exists sun_counter_last_seen integer;
alter table art_tags add column if not exists binding_status text not null default 'unprovisioned';

alter table art_tags drop constraint if exists art_tags_binding_status_check;
alter table art_tags add constraint art_tags_binding_status_check
  check (binding_status in ('unprovisioned', 'provisioned', 'bound', 'revoked'));

alter table art_tags drop constraint if exists art_tags_sun_counter_nonneg_check;
alter table art_tags add constraint art_tags_sun_counter_nonneg_check
  check (sun_counter_last_seen is null or sun_counter_last_seen >= 0);

-- Existing rows (created before this migration, all currently plain-string
-- QR UIDs with no crypto provisioning) are 'bound' if already bound to an
-- artwork, else 'unprovisioned' — this backfill makes binding_status
-- consistent with the pre-existing bound_at/artwork_id state rather than
-- leaving every historical row stuck at the default.
update art_tags set binding_status = 'bound' where bound_at is not null and binding_status = 'unprovisioned';

create index if not exists idx_art_tags_binding_status on art_tags (binding_status);
