-- 0025: condition reports (BE-1.36 / BE-1.37).
--
-- pw_condition_photos had no way to say whether a photo was taken when the
-- work went up or when it came down, which is the whole point of comparing
-- them. pw_damage_records had no artwork link, so damage could not be traced
-- to the piece it happened to.

alter table pw_condition_photos
  add column if not exists stage text not null default 'install'
  constraint pw_condition_photos_stage_check check (stage in ('install', 'deinstall'));

alter table pw_damage_records
  add column if not exists artwork_id text references artworks(id) on delete set null;

create index if not exists pw_damage_records_artwork_idx
  on pw_damage_records (artwork_id) where artwork_id is not null;
