"use server";

import { updateTag } from "next/cache";

import { recordAudit, recordAuditIn } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import {
  generateChecklist,
  isChecklistComplete,
  type ChecklistItem,
} from "@/features/physical-wall/checklist";
import { resolveToken } from "@/features/physical-wall/data/tokens";
import { mintQrToken } from "@/features/physical-wall/qr";
import {
  assertTransition,
  type SlotState,
} from "@/features/physical-wall/state-machine";
import {
  checkinVerifySchema,
  checklistUpdateSchema,
  installWindowSchema,
} from "@/features/physical-wall/schema";
import {
  fail,
  firstIssue,
  inTransaction,
  newId,
  ok,
  PreconditionError,
  toActionError,
  WALL_TAG,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

/**
 * Install operations (F13, F14, F15).
 *
 * The path a physical artwork takes: the artist picks a window, the system
 * generates a checklist from the booking's own facts, staff work through it at
 * the wall, scan the booking's QR, and the piece goes live. Each step is a
 * guarded state transition, and none of them can be skipped.
 */

/** The artist picks an install window (F13). */
export async function chooseInstallWindow(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");

    const parsed = installWindowSchema.safeParse({
      bookingId: formData.get("bookingId"),
      startsAt: formData.get("startsAt"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { bookingId, startsAt } = parsed.data;
    const starts = new Date(startsAt);
    if (Number.isNaN(starts.getTime())) return fail("That isn't a valid time.");

    const sql = getSql();

    const owned = (await sql`
      select id from pw_bookings
      where id = ${bookingId} and artist_id = ${actor.id} and status = 'paid'
      limit 1
    `) as { id: string }[];
    if (owned.length === 0) {
      return fail("That booking isn't yours, or isn't paid for yet.");
    }

    // F20: "agreement.signed → unlocks install scheduling". Checked here rather
    // than only in the UI, so the gate cannot be walked past.
    const signed = (await sql`
      select id from pw_agreements where booking_id = ${bookingId} limit 1
    `) as { id: string }[];
    if (signed.length === 0) {
      return fail(
        "Sign the exhibition agreement first — it sets out the terms for this booking."
      );
    }

    // One window per booking: choosing again replaces the previous choice
    // rather than stacking up offers nobody will attend.
    await sql`
      update pw_install_windows set status = 'cancelled'
      where booking_id = ${bookingId} and status in ('offered', 'reserved')
    `;

    const ends = new Date(starts.getTime() + 60 * 60 * 1000);
    await sql`
      insert into pw_install_windows (id, booking_id, starts_at, ends_at, status)
      values (${newId("iw")}, ${bookingId}, ${starts.toISOString()},
              ${ends.toISOString()}, 'reserved')
    `;

    updateTag(WALL_TAG);
    return ok("Install window booked. Bring the work and your booking QR.");
  } catch (error) {
    return toActionError("chooseInstallWindow", error);
  }
}

/**
 * Generate the checklist for a booking and move its slots to `received` (F14).
 *
 * Derived from the booking's own facts — size class, weight, slot type, add-ons
 * — so it reflects what is actually being hung rather than a generic list. The
 * generated items are stored, which is what lets an audit see what a staff
 * member was asked to confirm even after these rules change.
 */
export async function receiveArtwork(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("staff");
    const bookingId = String(formData.get("bookingId") ?? "");
    if (!bookingId) return fail("Which booking?");

    const created = await inTransaction(async (client) => {
      const slots = await client.query<{
        slot_id: string;
        label: string;
        state: SlotState;
        size_name: string;
        weight_kg: number;
        type_label: string;
      }>(
        `select s.id as slot_id, s.label, s.state,
                z.name as size_name, z.weight_kg, t.label as type_label
         from pw_booking_slots bs
         join pw_slots s          on s.id = bs.slot_id
         join pw_size_catalog z   on z.id = s.size_id
         join pw_slot_types   t   on t.id = s.type_id
         where bs.booking_id = $1
         for update of s`,
        [bookingId]
      );
      if (slots.rowCount === 0) throw new PreconditionError("No such booking.");

      const addons = await client.query<{ label: string }>(
        `select label from pw_booking_addons where booking_id = $1`,
        [bookingId]
      );
      const addonLabels = addons.rows.map((row) => row.label);

      let count = 0;
      for (const slot of slots.rows) {
        // booked -> received. Illegal from anywhere else, and the state machine
        // is what says so rather than a comment.
        assertTransition(slot.state, "received", { isAdmin: false });

        const items = generateChecklist({
          sizeName: slot.size_name,
          weightKg: slot.weight_kg,
          typeLabel: slot.type_label,
          addonLabels,
        });

        await client.query(
          `insert into pw_checkins (id, booking_id, slot_id, checklist, status)
           values ($1, $2, $3, $4::jsonb, 'pending')
           on conflict (booking_id, slot_id) do nothing`,
          [
            newId("ci"),
            bookingId,
            slot.slot_id,
            JSON.stringify({ items, completed: [] }),
          ]
        );

        await client.query(
          `update pw_slots
           set state = 'received', version = version + 1, updated_at = now()
           where id = $1`,
          [slot.slot_id]
        );
        count += 1;
      }

      await recordAuditIn(client, {
        actor,
        action: "install.received",
        subjectType: "booking",
        subjectId: bookingId,
        after: { slots: count },
      });

      return count;
    });

    updateTag(WALL_TAG);
    return ok(`Received. ${created} checklist(s) generated.`);
  } catch (error) {
    return toActionError("receiveArtwork", error);
  }
}

/** Tick checklist items (F14). Purely a save — activation is a separate step. */
export async function updateChecklist(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("staff");

    const parsed = checklistUpdateSchema.safeParse({
      checkinId: formData.get("checkinId"),
      completed: formData.getAll("completed").map(String),
      conditionNotes: formData.get("conditionNotes") || undefined,
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { checkinId, completed, conditionNotes } = parsed.data;
    const sql = getSql();

    const rows = (await sql`
      select checklist from pw_checkins where id = ${checkinId} limit 1
    `) as { checklist: unknown }[];
    if (rows.length === 0) return fail("No such check-in.");

    const stored = rows[0].checklist as { items?: ChecklistItem[] };
    const items = Array.isArray(stored?.items) ? stored.items : [];

    // Only keys that are actually on this checklist are stored. Otherwise a
    // crafted form could tick items that do not exist and satisfy the
    // completeness test without anyone touching the wall.
    const validKeys = new Set(items.map((item) => item.key));
    const accepted = completed.filter((key) => validKeys.has(key));

    await sql`
      update pw_checkins
      set checklist = ${JSON.stringify({ items, completed: accepted })}::jsonb,
          condition_notes = ${conditionNotes ?? null},
          updated_at = now()
      where id = ${checkinId}
    `;

    await recordAudit({
      actor,
      action: "checkin.checklist.updated",
      subjectType: "checkin",
      subjectId: checkinId,
      after: { completed: accepted, of: items.length },
    });

    updateTag(WALL_TAG);

    return ok(
      `${accepted.length} of ${items.length} checked.` +
        (accepted.length === items.length
          ? " Ready to verify and go live."
          : "")
    );
  } catch (error) {
    return toActionError("updateChecklist", error);
  }
}

/**
 * Scan the booking QR, verify it, and take the work live (F15).
 *
 * The order is deliberate and each gate is load-bearing:
 *
 *  1. The token's signature must be ours, and it must resolve to a booking that
 *     has not been revoked.
 *  2. That booking must actually be the one holding this slot — scanning a valid
 *     code from a *different* booking is exactly the swap risk QR-only
 *     reintroduces, so a mismatch blocks and says so.
 *  3. The checklist must be 100% complete. This is the spec's hard gate.
 *  4. Only then: received -> installed -> live.
 */
export async function verifyAndGoLive(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("staff");

    const parsed = checkinVerifySchema.safeParse({
      token: formData.get("token"),
      slotId: formData.get("slotId"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { token, slotId } = parsed.data;

    const resolved = await resolveToken(token);
    if (!resolved.ok) {
      return fail(
        resolved.reason === "malformed"
          ? "That code isn't one of ours. Check the label for tampering."
          : `That code is ${resolved.reason}. Do not install against it.`
      );
    }
    if (resolved.subject.subjectType !== "booking") {
      return fail("That's not a booking code.");
    }

    const bookingId = resolved.subject.subjectId;

    await inTransaction(async (client) => {
      const link = await client.query<{ slot_id: string; label: string; state: SlotState }>(
        `select bs.slot_id, s.label, s.state
         from pw_booking_slots bs
         join pw_slots s on s.id = bs.slot_id
         where bs.booking_id = $1 and bs.slot_id = $2
         for update of s`,
        [bookingId, slotId]
      );

      if (link.rowCount === 0) {
        throw new PreconditionError(
          "That code belongs to a different booking. Stop — this is the wrong artwork for this slot."
        );
      }

      const slot = link.rows[0];

      // F20: "Unsigned agreement blocks go-live." The last gate before a work
      // goes on a public wall is that its terms exist and were agreed to.
      const agreement = await client.query(
        `select id from pw_agreements where booking_id = $1`,
        [bookingId]
      );
      if (agreement.rowCount === 0) {
        throw new PreconditionError(
          "This booking has no signed agreement. It cannot go live until the artist signs."
        );
      }

      const checkin = await client.query<{ id: string; checklist: unknown }>(
        `select id, checklist from pw_checkins
         where booking_id = $1 and slot_id = $2 for update`,
        [bookingId, slotId]
      );
      if (checkin.rowCount === 0) {
        throw new PreconditionError(
          "No checklist for this slot yet. Receive the work first."
        );
      }

      const stored = checkin.rows[0].checklist as {
        items?: ChecklistItem[];
        completed?: string[];
      };
      const items = Array.isArray(stored?.items) ? stored.items : [];
      const completed = Array.isArray(stored?.completed) ? stored.completed : [];

      if (!isChecklistComplete(items, completed)) {
        const outstanding = items.filter((item) => !completed.includes(item.key));
        throw new PreconditionError(
          `Checklist incomplete — ${outstanding.length} item(s) left: ${outstanding
            .map((item) => item.label)
            .join("; ")}`
        );
      }

      assertTransition(slot.state, "installed", { isAdmin: false });

      await client.query(
        `update pw_checkins
         set status = 'verified', verified_by = $2, verified_at = now(), updated_at = now()
         where id = $1`,
        [checkin.rows[0].id, actor.id]
      );

      await client.query(
        `update pw_slots
         set state = 'live', version = version + 1, updated_at = now()
         where id = $1`,
        [slotId]
      );

      // Give the artwork its own public QR label, if it does not have one. This
      // is the code that goes on the wall beside the piece and that visitors
      // scan (F21/F22) — distinct from the booking code staff just scanned.
      const artwork = await client.query<{ artwork_id: string | null }>(
        `select artwork_id from pw_bookings where id = $1`,
        [bookingId]
      );
      const artworkId = artwork.rows[0]?.artwork_id;

      if (artworkId) {
        const existing = await client.query(
          `select 1 from pw_qr_tokens
           where subject_type = 'artwork' and subject_id = $1 and revoked_at is null`,
          [artworkId]
        );
        if (existing.rowCount === 0) {
          const artworkToken = mintQrToken();
          await client.query(
            `insert into pw_qr_tokens (token, subject_type, subject_id)
             values ($1, 'artwork', $2)`,
            [artworkToken, artworkId]
          );
          await client.query(
            `update artworks set "qrToken" = $2, "physicalStatus" = 'live' where id = $1`,
            [artworkId, artworkToken]
          );
        } else {
          await client.query(
            `update artworks set "physicalStatus" = 'live' where id = $1`,
            [artworkId]
          );
        }
      }

      await recordAuditIn(client, {
        actor,
        action: "checkin.verified",
        subjectType: "slot",
        subjectId: slotId,
        before: { state: slot.state },
        after: { state: "live", bookingId },
      });
    });

    updateTag(WALL_TAG);
    return ok("Verified. The work is live on the wall.");
  } catch (error) {
    return toActionError("verifyAndGoLive", error);
  }
}

/**
 * Issue the booking QR the artist brings to the counter.
 *
 * Minted on demand rather than at booking time so a code only exists once there
 * is something to scan it against.
 */
export async function issueBookingToken(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");
    const bookingId = String(formData.get("bookingId") ?? "");
    if (!bookingId) return fail("Which booking?");

    const sql = getSql();
    const owned = (await sql`
      select id from pw_bookings
      where id = ${bookingId} and artist_id = ${actor.id} limit 1
    `) as { id: string }[];
    if (owned.length === 0) return fail("That booking isn't yours.");

    const existing = (await sql`
      select token from pw_qr_tokens
      where subject_type = 'booking' and subject_id = ${bookingId} and revoked_at is null
      limit 1
    `) as { token: string }[];

    if (existing.length > 0) return ok("Code ready.", { token: existing[0].token });

    const token = mintQrToken();
    await sql`
      insert into pw_qr_tokens (token, subject_type, subject_id)
      values (${token}, 'booking', ${bookingId})
    `;

    return ok("Code ready.", { token });
  } catch (error) {
    return toActionError("issueBookingToken", error);
  }
}
