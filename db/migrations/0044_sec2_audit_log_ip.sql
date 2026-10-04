-- 0044: SEC-2.11 — capture the actor's IP on every audit log entry.
--
-- pw_audit_log already records actor, action, subject and timestamp, but
-- never the caller's IP — so "this admin did this" couldn't be tied to
-- "from this network", which the Bible's accountability requirement (§69)
-- and SEC-2.11 both call for. Nullable: entries written by a cron/system
-- actor or before this migration have no request to read an IP from.
alter table pw_audit_log add column if not exists actor_ip text;
