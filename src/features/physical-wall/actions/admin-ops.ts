"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import { queueNotification } from "@/features/physical-wall/notifications";
import {
  fail,
  firstIssue,
  newId,
  ok,
  toActionError,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

/**
 * Admin operations added in Phase 1: grievance responses and notification
 * delivery. Both are admin-only, both are audited.
 */

const responseSchema = z.object({
  grievanceId: z.string().min(1),
  body: z.string().trim().min(10, "Write a real reply — at least a sentence.").max(2000),
});

/**
 * Respond to a grievance (§5.3).
 *
 * The response is appended as its own row — the thread stays readable — the
 * grievance is marked answered (stopping the 30-day clock), and the person who
 * raised it gets notified if we have an address for them.
 */
export async function respondToGrievance(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const parsed = responseSchema.safeParse({
      grievanceId: formData.get("grievanceId"),
      body: formData.get("body"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const sql = getSql();
    const rows = (await sql`
      update pw_grievances
      set status = 'answered', responded_at = now()
      where id = ${parsed.data.grievanceId} and status = 'open'
      returning id, contact, user_id
    `) as { id: string; contact: string; user_id: string | null }[];

    if (rows.length === 0) {
      return fail("That grievance has already been answered or no longer exists.");
    }
    const grievance = rows[0];

    await sql`
      insert into pw_grievance_responses (id, grievance_id, author_id, body)
      values (${newId("grs")}, ${parsed.data.grievanceId}, ${actor.id}, ${parsed.data.body})
    `;

    await queueNotification({
      userId: grievance.user_id,
      recipient: grievance.contact,
      subject: "Your grievance has a reply",
      body:
        `We have responded to your grievance ("${parsed.data.body.slice(0, 80)}…").

` +
        `Reply:
${parsed.data.body}

— Artwall Labs`,
      kind: "grievance.responded",
    });

    await recordAudit({
      actor,
      action: "grievance.responded",
      subjectType: "grievance",
      subjectId: parsed.data.grievanceId,
      after: { length: parsed.data.body.length },
    });

    return ok("Response recorded and queued for delivery.");
  } catch (error) {
    return toActionError("respondToGrievance", error);
  }
}

/** Close a grievance without further action. Audited. */
export async function closeGrievance(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");
    const id = String(formData.get("grievanceId") ?? "");
    if (!id) return fail("Which grievance?");

    const sql = getSql();
    const rows = (await sql`
      update pw_grievances set status = 'closed', responded_at = now()
      where id = ${id} and status <> 'closed'
      returning id
    `) as { id: string }[];
    if (rows.length === 0) return fail("Nothing to close.");

    await recordAudit({
      actor,
      action: "grievance.closed",
      subjectType: "grievance",
      subjectId: id,
    });
    return ok("Grievance closed.");
  } catch (error) {
    return toActionError("closeGrievance", error);
  }
}

/**
 * Trigger delivery of pending notifications now.
 *
 * Normally a cron hits `/api/cron/deliver-notifications`; this button exists so
 * the founder can flush the queue by hand before trusting that cron exists.
 */
export async function deliverNotificationsNow(): Promise<ActionState> {
  try {
    await requireRole("admin");
    const { deliverPendingNotifications } = await import(
      "@/features/physical-wall/notifications"
    );
    const result = await deliverPendingNotifications(50);

    if (result.skipped > 0) {
      return {
        status: "error",
        message:
          `${result.skipped} pending — RESEND_API_KEY is not configured, so nothing was sent.`,
      };
    }
    return ok(`Sent ${result.sent}, failed ${result.failed}.`);
  } catch (error) {
    return toActionError("deliverNotificationsNow", error);
  }
}