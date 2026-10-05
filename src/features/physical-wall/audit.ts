import "server-only";

import { headers } from "next/headers";
import type { PoolClient } from "pg";

import type { Actor } from "@/features/physical-wall/authorize";
import { getSql } from "@/lib/db";
import { clientIp } from "@/lib/rate-limit";

/**
 * The audit log.
 *
 * Every structural grid edit, catalog change, force action, refund and
 * redemption lands here with who did it and what the row looked like before and
 * after. The spec asks for it (F01, F02, F12, §7) and the DPDP accountability
 * duty assumes it exists.
 *
 * Two entry points, and the difference matters:
 *
 *  - `recordAudit` writes on its own connection. Fine for a single-statement
 *    change where there is no transaction to join.
 *  - `recordAuditIn` writes inside a caller's transaction, so the log entry and
 *    the change it describes commit or roll back together. A booking that rolled
 *    back must not leave an audit line claiming it happened.
 *
 * A failure to write the log never fails the action it describes. That is a
 * deliberate trade: losing one audit line is bad, but refusing to release a
 * slot because the logger hiccuped is worse for the person at the wall. The
 * failure is logged loudly instead.
 */

/**
 * Only id/name/email are ever read by this log — `role` is physical-wall's
 * own RBAC concept and means nothing to a caller outside that feature (e.g.
 * a blockchain route gating on wallet ownership, not a Role). Accepting the
 * narrower shape lets every actor log who they are without inventing a role.
 */
type AuditActor = Pick<Actor, "id" | "name" | "email">;

export interface AuditEntry {
  actor: AuditActor | null;
  action: string;
  subjectType: string;
  subjectId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * The caller's IP, for SEC-2.11 ("this admin did this, from this network").
 *
 * `headers()` throws outside a request context — a cron job or a script
 * calling recordAudit directly has no request to read. That's not an audit
 * failure, just nothing to attribute, so it resolves to null rather than
 * propagating: the entry still gets actor/action/subject/timestamp.
 */
async function callerIp(): Promise<string | null> {
  try {
    return clientIp(await headers());
  } catch {
    return null;
  }
}

/** Write inside an existing transaction. Errors propagate — the caller decides. */
export async function recordAuditIn(
  client: PoolClient,
  entry: AuditEntry
): Promise<void> {
  const ip = await callerIp();
  await client.query(
    `insert into pw_audit_log
       (actor_id, actor_label, action, subject_type, subject_id, before, after, actor_ip)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.actor?.id ?? null,
      entry.actor ? `${entry.actor.name} <${entry.actor.email}>` : null,
      entry.action,
      entry.subjectType,
      entry.subjectId ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      ip,
    ]
  );
}

/** Write standalone. Never throws. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const sql = getSql();
    const ip = await callerIp();
    await sql`
      insert into pw_audit_log
        (actor_id, actor_label, action, subject_type, subject_id, before, after, actor_ip)
      values (
        ${entry.actor?.id ?? null},
        ${entry.actor ? `${entry.actor.name} <${entry.actor.email}>` : null},
        ${entry.action},
        ${entry.subjectType},
        ${entry.subjectId ?? null},
        ${entry.before === undefined ? null : JSON.stringify(entry.before)},
        ${entry.after === undefined ? null : JSON.stringify(entry.after)},
        ${ip}
      )
    `;
  } catch (error) {
    console.error("[physical-wall] Could not write audit entry", entry.action, error);
  }
}
