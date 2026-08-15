"use server";

import { updateTag } from "next/cache";

import { recordAuditIn } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import { getRefundPolicyVersion } from "@/features/physical-wall/data/catalogs";
import { refundAmountPaise } from "@/features/physical-wall/pricing";
import { formatINR } from "@/features/physical-wall/money";
import {
  assertTransition,
  isOccupied,
  type SlotState,
} from "@/features/physical-wall/state-machine";
import { forceReleaseSchema, transitionSchema } from "@/features/physical-wall/schema";
import {
  fail,
  firstIssue,
  inTransaction,
  LEDGER_TAG,
  newId,
  ok,
  PreconditionError,
  StaleWriteError,
  toActionError,
  WALL_TAG,
  type ActionState,
} from "@/features/physical-wall/actions/shared";

/**
 * Admin force actions (F12).
 *
 * These bypass availability and payment checks by design — that is the whole
 * point of a force action, and pretending otherwise would just mean staff
 * working around the system at the wall instead of through it. What makes them
 * safe is not restriction but accountability: admin-only, confirmed explicitly,
 * reason required, and every one of them written to the audit log with the
 * before and after state.
 */

/** Move a slot by hand. Still refused if the state machine forbids the move. */
export async function transitionSlot(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const parsed = transitionSchema.safeParse({
      slotId: formData.get("slotId"),
      to: formData.get("to"),
      version: formData.get("version"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { slotId, to, version } = parsed.data;

    await inTransaction(async (client) => {
      const current = await client.query<{
        state: SlotState;
        version: number;
        label: string;
      }>(`select state, version, label from pw_slots where id = $1 for update`, [
        slotId,
      ]);
      if (current.rowCount === 0) throw new PreconditionError("No such slot.");

      const slot = current.rows[0];
      if (slot.version !== version) throw new StaleWriteError();

      assertTransition(slot.state, to, { isAdmin: true });

      await client.query(
        `update pw_slots
         set state = $2, version = version + 1, updated_at = now()
         where id = $1`,
        [slotId, to]
      );

      await recordAuditIn(client, {
        actor,
        action: "slot.forced",
        subjectType: "slot",
        subjectId: slotId,
        before: { state: slot.state },
        after: { state: to },
      });
    });

    updateTag(WALL_TAG);
    return ok(`Slot moved to ${to}.`);
  } catch (error) {
    return toActionError("transitionSlot", error);
  }
}

/**
 * Force-release a slot, cancelling whatever is on it (F12).
 *
 * The refund is computed from **the policy version snapshotted on the booking**,
 * not the policy in force today. An artist who booked under a 75% policy is owed
 * 75% even if the founder has since dropped it to 25% — that is what versioning
 * the policy was for, and reading the current row here would quietly break the
 * promise the agreement made.
 *
 * Releasing a slot with a live artwork on it raises a de-install task, because
 * the piece is physically still on the wall and someone has to take it down.
 */
export async function forceRelease(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const parsed = forceReleaseSchema.safeParse({
      slotId: formData.get("slotId"),
      reason: formData.get("reason"),
      confirm: formData.get("confirm"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { slotId, reason } = parsed.data;

    const outcome = await inTransaction(async (client) => {
      const current = await client.query<{ state: SlotState; label: string }>(
        `select state, label from pw_slots where id = $1 for update`,
        [slotId]
      );
      if (current.rowCount === 0) throw new PreconditionError("No such slot.");

      const slot = current.rows[0];
      const wasLive = slot.state === "live" || slot.state === "installed";

      const booking = await client.query<{
        id: string;
        artist_id: string;
        status: string;
        total_amount_paise: number;
        refund_policy_version: number | null;
      }>(
        `select b.id, b.artist_id, b.status, b.total_amount_paise, b.refund_policy_version
         from pw_booking_slots bs
         join pw_bookings b on b.id = bs.booking_id
         where bs.slot_id = $1 and b.status in ('held', 'paid')
         order by b.created_at desc
         limit 1
         for update of b`,
        [slotId]
      );

      let refundPaise = 0;
      let policyLabel = "no policy on file";
      const affected = booking.rows[0];

      if (affected) {
        if (affected.status === "paid" && affected.refund_policy_version) {
          const policy = await getRefundPolicyVersion(
            affected.refund_policy_version
          );
          if (policy) {
            refundPaise = refundAmountPaise(
              Number(affected.total_amount_paise),
              policy.percentage
            );
            policyLabel = `v${policy.version} at ${policy.percentage}%`;
          }
        }

        await client.query(
          `update pw_bookings
           set status = $2, cancelled_reason = $3, hold_expires_at = null, updated_at = now()
           where id = $1`,
          [affected.id, refundPaise > 0 ? "refunded" : "cancelled", reason]
        );

        if (refundPaise > 0) {
          // The refund is recorded against the day it is raised. Whether it has
          // *settled* is the PSP's business and shows up as its own reconciliation.
          await client.query(
            `insert into pw_ledger (id, type, category, amount_paise, note, entry_date, source_ref, created_by)
             values ($1, 'expense', 'refund', $2, $3, current_date, $4, $5)
             on conflict (source_ref) where source_ref is not null do nothing`,
            [
              newId("led"),
              refundPaise,
              `Refund for ${affected.id} — ${policyLabel}. ${reason}`,
              `refund:${affected.id}`,
              actor.id,
            ]
          );
        }

        // Anything else the booking was holding goes back too — releasing one
        // slot of a five-slot booking and leaving four in limbo helps nobody.
        await client.query(
          `update pw_slots
           set state = 'available', version = version + 1, updated_at = now()
           where id in (select slot_id from pw_booking_slots where booking_id = $1)`,
          [affected.id]
        );

        await client.query(
          `update artworks set "physicalStatus" = null
           where id = (select artwork_id from pw_bookings where id = $1)`,
          [affected.id]
        );
      } else {
        await client.query(
          `update pw_slots
           set state = 'available', version = version + 1, updated_at = now()
           where id = $1`,
          [slotId]
        );
      }

      if (wasLive) {
        // A de-install task, on the founder's existing task list rather than a
        // new table: someone physically has to take the work off the wall.
        await client.query(
          `insert into tasks (id, "userId", title, status)
           values ($1, $2, $3, 'open')`,
          [
            newId("task"),
            actor.id,
            `De-install ${slot.label} — force-released. ${reason}`,
          ]
        );
      }

      await recordAuditIn(client, {
        actor,
        action: "slot.force-released",
        subjectType: "slot",
        subjectId: slotId,
        before: { state: slot.state, bookingId: affected?.id ?? null },
        after: {
          state: "available",
          reason,
          refundPaise,
          refundPolicy: policyLabel,
          deInstallTaskRaised: wasLive,
        },
      });

      return { refundPaise, policyLabel, wasLive, hadBooking: Boolean(affected) };
    });

    updateTag(WALL_TAG);
    updateTag(LEDGER_TAG);

    const parts = ["Slot released."];
    if (outcome.refundPaise > 0) {
      parts.push(
        `Refund of ${formatINR(outcome.refundPaise)} raised under ${outcome.policyLabel}.`
      );
    } else if (outcome.hadBooking) {
      parts.push("Booking cancelled; no refund was due.");
    }
    if (outcome.wasLive) parts.push("A de-install task has been raised.");

    return ok(parts.join(" "));
  } catch (error) {
    return toActionError("forceRelease", error);
  }
}

/**
 * Take a slot out of service, or put it back (F12 side states).
 *
 * Refused while something is on the slot: blocking a wall position with a live
 * artwork on it would leave the piece hanging with no booking to explain it.
 */
export async function setSlotServiceState(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");
    const slotId = String(formData.get("slotId") ?? "");
    const to = String(formData.get("to") ?? "") as SlotState;

    if (!slotId) return fail("Which slot?");
    if (!["maintenance", "blocked", "available"].includes(to)) {
      return fail("That isn't a service state.");
    }

    await inTransaction(async (client) => {
      const current = await client.query<{ state: SlotState; label: string }>(
        `select state, label from pw_slots where id = $1 for update`,
        [slotId]
      );
      if (current.rowCount === 0) throw new PreconditionError("No such slot.");

      const slot = current.rows[0];
      if (isOccupied(slot.state)) {
        throw new PreconditionError(
          `${slot.label} is ${slot.state}. Release it before taking it out of service.`
        );
      }

      assertTransition(slot.state, to, { isAdmin: true });

      await client.query(
        `update pw_slots
         set state = $2, version = version + 1, updated_at = now()
         where id = $1`,
        [slotId, to]
      );

      await recordAuditIn(client, {
        actor,
        action: "slot.service-state",
        subjectType: "slot",
        subjectId: slotId,
        before: { state: slot.state },
        after: { state: to },
      });
    });

    updateTag(WALL_TAG);
    return ok(`Slot is now ${to}.`);
  } catch (error) {
    return toActionError("setSlotServiceState", error);
  }
}
