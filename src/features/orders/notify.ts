import "server-only";

import {
  notify,
  type NotificationData,
  type NotificationKind,
} from "@/features/physical-wall/notifications";
import { pool } from "@/lib/db/index";

/**
 * Queue a marketplace notification on the existing outbox (pw_notifications).
 * Always called AFTER the order transaction commits and never throws, so a mail
 * problem cannot undo an order. `dedupeKey` makes a retried webhook or
 * double-clicked button queue the message once.
 */
export async function notifyOrderUser<K extends NotificationKind & `order.${string}`>(
  kind: K,
  userId: string,
  dedupeKey: string,
  data: (user: { name: string }) => NotificationData<K>
): Promise<void> {
  try {
    const { rows } = await pool.query<{ email: string; name: string }>(`select email, name from "user" where id = $1 limit 1`, [userId]);
    if (!rows[0]) return;
    await notify(kind, { userId, email: rows[0].email, dedupeKey }, data({ name: rows[0].name }));
  } catch (error) {
    console.error("[orders] Could not queue notification", kind, error);
  }
}
