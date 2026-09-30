-- 0053: append-only log of DPDP data-principal requests (BE-2.22).
--
-- Every export and erasure request is recorded when it is made and again when
-- it completes or fails, with timestamps, so we can show a regulator (and the
-- person) what was asked and when it was done. The audit log also notes
-- erasures, but it is an operational trail, pseudonymised on erasure; this is
-- the accountability record for the requests themselves.
--
-- user_id is deliberately not a foreign key: the log must outlive the account.
-- After erasure it points at the tombstoned "user" row and holds nothing else
-- personal (detail carries counts and categories, never names or emails).
--
-- Append-only is enforced by the database: UPDATE, DELETE and TRUNCATE raise.

create table if not exists pw_data_rights_requests (
  id      text        primary key,
  user_id text        not null,
  kind    text        not null check (kind in ('export', 'erasure')),
  event   text        not null check (event in ('requested', 'completed', 'failed')),
  detail  jsonb,
  at      timestamptz not null default now()
);

create index if not exists pw_data_rights_requests_user_idx on pw_data_rights_requests (user_id, at);

create or replace function pw_data_rights_requests_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'pw_data_rights_requests is append-only: % is not allowed', tg_op
    using errcode = 'restrict_violation';
end
$$;

drop trigger if exists pw_data_rights_requests_no_change on pw_data_rights_requests;
create trigger pw_data_rights_requests_no_change
  before update or delete on pw_data_rights_requests
  for each row execute function pw_data_rights_requests_append_only();

drop trigger if exists pw_data_rights_requests_no_truncate on pw_data_rights_requests;
create trigger pw_data_rights_requests_no_truncate
  before truncate on pw_data_rights_requests
  for each statement execute function pw_data_rights_requests_append_only();
