-- 0024: install capacity (BE-1.15).
--
-- How many install windows the venue team can run at the same time. Each
-- window is one hour; chooseInstallWindow refuses a window once this many
-- reserved windows already overlap it.
alter table pw_settings
  add column if not exists install_capacity integer not null default 2
  constraint pw_settings_install_capacity_check check (install_capacity > 0);
