"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import { recordAudit, recordAuditIn } from "@/features/physical-wall/audit";
import { getActor, requireRole } from "@/features/physical-wall/authorize";
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
 * The waitlist and its queue (F10, C04).
 *
 * Two rules from the spec drive the whole design:
 *
 *  1. **Automatic priority** is founding > repeat > referred > new.
 *  2. **Manual overrides sit above it**, and every override is logged.
 *
 * So ordering is `priority_rank` first (admin-set, usually null), then the tier,
 * then arrival time. An admin who promotes someone is making a decision the
 * queue will honour and the log will remember — which is the only way a queue
 * that decides who gets a wall stays defensible.
 */

const TIER_ORDER = ["founding", "repeat", "referred", "new"] as const;

const joinSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(80),
  contact: z.string().trim().min(3, "How should we reach you?").max(120),
  city: z.string().trim().max(60).optional(),
  medium: z.string().trim().max(60).optional(),
  sizePref: z.string().trim().max(60).optional(),
  note: z.string().trim().max(280).optional(),
});

/**
 * Work out an artist's tier from what we already know (F10).
 *
 * Founding status is claimed at onboarding; "repeat" means they have exhibited
 * before. Nothing here asks the artist to rank themselves, because a
 * self-declared priority is not a priority.
 */
async function tierFor(artistId: string | null): Promise<string> {
  if (!artistId) return "new";

  try {
    const sql = getSql();
    const rows = (await sql`
      select
        (select "foundingMember" from "user" where id = ${artistId}) as founding,
        (select count(*)::int from pw_bookings
         where artist_id = ${artistId} and status in ('paid', 'completed')) as past
    `) as { founding: boolean; past: number }[];

    const row = rows[0];
    if (row?.founding) return "founding";
    if (Number(row?.past ?? 0) > 0) return "repeat";
    return "new";
  } catch (error) {
    console.error("[physical-wall] Could not compute tier", error);
    return "new";
  }
}

/** Join the queue. Consent-relevant: this stores a name and a contact (§5.2). */
export async function joinWaitlist(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await getActor();

    const parsed = joinSchema.safeParse({
      name: formData.get("name"),
      contact: formData.get("contact"),
      city: formData.get("city") || undefined,
      medium: formData.get("medium") || undefined,
      sizePref: formData.get("sizePref") || undefined,
      note: formData.get("note") || undefined,
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));
    if (formData.get("consent") !== "on") {
      return fail(
        "We can only hold your place if you agree to us storing your name and contact."
      );
    }

    const input = parsed.data;
    const tier = await tierFor(actor?.id ?? null);
    const sql = getSql();
    const id = newId("wl");

    const inserted = (await sql`
      insert into pw_waitlist
        (id, artist_id, name, contact, city, medium, size_pref, note, tier)
      values (${id}, ${actor?.id ?? null}, ${input.name}, ${input.contact},
              ${input.city ?? null}, ${input.medium ?? null},
              ${input.sizePref ?? null}, ${input.note ?? null}, ${tier})
      on conflict do nothing
      returning id
    `) as { id: string }[];

    if (inserted.length === 0) {
      return fail("You're already in the queue — we'll be in touch.");
    }

    await recordAudit({
      actor,
      action: "waitlist.joined",
      subjectType: "waitlist",
      subjectId: id,
      after: { tier, city: input.city, medium: input.medium },
    });

    updateTag(WALL_TAG);
    return ok(
      tier === "founding"
        ? "You're in the queue, near the front — founding members get priority."
        : "You're in the queue. We'll message you the moment something opens up."
    );
  } catch (error) {
    return toActionError("joinWaitlist", error);
  }
}

/** Leave the queue. As easy as joining it. */
export async function leaveWaitlist(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");
    const id = String(formData.get("waitlistId") ?? "");
    if (!id) return fail("Which entry?");

    const sql = getSql();
    const rows = (await sql`
      update pw_waitlist set status = 'removed', updated_at = now()
      where id = ${id} and artist_id = ${actor.id} and status in ('queued', 'offered')
      returning id
    `) as { id: string }[];

    if (rows.length === 0) return fail("We couldn't find your place in the queue.");

    await recordAudit({
      actor,
      action: "waitlist.left",
      subjectType: "waitlist",
      subjectId: id,
    });

    updateTag(WALL_TAG);
    return ok("You're out of the queue. Join again whenever you like.");
  } catch (error) {
    return toActionError("leaveWaitlist", error);
  }
}

const MOVES = ["promote", "demote", "remove", "note"] as const;

/**
 * Admin queue control (C04).
 *
 * Promotion and demotion write an explicit `priority_rank`, which is what makes
 * a manual decision outrank the automatic tier rather than fighting it. Every
 * action lands in `pw_queue_overrides` *and* the audit log — the first so the
 * queue's own history is readable beside it, the second so it sits with every
 * other override in the system.
 */
export async function adjustQueue(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const id = String(formData.get("waitlistId") ?? "");
    const move = String(formData.get("move") ?? "");
    const note = String(formData.get("note") ?? "").trim();

    if (!id) return fail("Which entry?");
    if (!MOVES.includes(move as (typeof MOVES)[number])) {
      return fail("Unknown action.");
    }
    if (move === "remove" && note.length < 3) {
      return fail("Say why you're removing them — this is logged.");
    }

    await inTransaction(async (client) => {
      const current = await client.query<{
        name: string;
        priority_rank: number | null;
        status: string;
      }>(
        `select name, priority_rank, status from pw_waitlist where id = $1 for update`,
        [id]
      );
      if (current.rowCount === 0) throw new PreconditionError("No such entry.");

      const before = current.rows[0];

      if (move === "remove") {
        await client.query(
          `update pw_waitlist set status = 'removed', updated_at = now() where id = $1`,
          [id]
        );
      } else if (move === "promote" || move === "demote") {
        // Promoting puts them one place ahead of the current front; demoting one
        // behind the back. Simple, and it means repeated clicks keep working
        // rather than fighting over a single "1".
        const bound = await client.query<{ top: number | null; bottom: number | null }>(
          `select min(priority_rank) as top, max(priority_rank) as bottom
           from pw_waitlist where status = 'queued'`
        );
        const top = bound.rows[0]?.top ?? 0;
        const bottom = bound.rows[0]?.bottom ?? 0;
        const rank = move === "promote" ? top - 1 : bottom + 1;

        await client.query(
          `update pw_waitlist set priority_rank = $2, updated_at = now() where id = $1`,
          [id, rank]
        );
      } else {
        await client.query(
          `update pw_waitlist set note = $2, updated_at = now() where id = $1`,
          [id, note || null]
        );
      }

      await client.query(
        `insert into pw_queue_overrides (id, waitlist_id, action, actor_id, note)
         values ($1, $2, $3, $4, $5)`,
        [newId("qo"), id, move, actor.id, note || null]
      );

      await recordAuditIn(client, {
        actor,
        action: `waitlist.${move}`,
        subjectType: "waitlist",
        subjectId: id,
        before: { rank: before.priority_rank, status: before.status },
        after: { note: note || null },
      });
    });

    updateTag(WALL_TAG);
    return ok("Queue updated.");
  } catch (error) {
    return toActionError("adjustQueue", error);
  }
}

/**
 * Force-match someone to an open slot (C04).
 *
 * Offers the slot rather than booking it: the artist still has to accept and
 * pay, so this creates a time-boxed claim, not a booking somebody else made on
 * their behalf. The slot is held meanwhile, which is the point of the offer.
 */
export async function forceMatch(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const id = String(formData.get("waitlistId") ?? "");
    const slotId = String(formData.get("slotId") ?? "");
    if (!id || !slotId) return fail("Choose an entry and a slot.");

    const label = await inTransaction(async (client) => {
      const slot = await client.query<{ state: string; label: string }>(
        `select state, label from pw_slots where id = $1 for update`,
        [slotId]
      );
      if (slot.rowCount === 0) throw new PreconditionError("No such slot.");
      if (slot.rows[0].state !== "available") {
        throw new PreconditionError(
          `${slot.rows[0].label} is ${slot.rows[0].state}, so it cannot be offered.`
        );
      }

      const entry = await client.query<{ name: string }>(
        `select name from pw_waitlist where id = $1 and status = 'queued' for update`,
        [id]
      );
      if (entry.rowCount === 0) {
        throw new PreconditionError("That entry is no longer in the queue.");
      }

      await client.query(
        `update pw_waitlist
         set status = 'offered', matched_slot_id = $2,
             offer_expires_at = now() + interval '48 hours', updated_at = now()
         where id = $1`,
        [id, slotId]
      );

      // Held, not booked. `reserved` is the state the booking flow already
      // understands, so an accepted offer converts through the normal path.
      await client.query(
        `update pw_slots set state = 'reserved', version = version + 1, updated_at = now()
         where id = $1`,
        [slotId]
      );

      await client.query(
        `insert into pw_queue_overrides (id, waitlist_id, action, actor_id, note)
         values ($1, $2, 'force-match', $3, $4)`,
        [newId("qo"), id, actor.id, `Offered ${slot.rows[0].label}`]
      );

      await recordAuditIn(client, {
        actor,
        action: "waitlist.force-matched",
        subjectType: "waitlist",
        subjectId: id,
        after: { slotId, slotLabel: slot.rows[0].label, expiresInHours: 48 },
      });

      return slot.rows[0].label;
    });

    updateTag(WALL_TAG);
    return ok(`${label} is held for them for 48 hours. Let them know.`);
  } catch (error) {
    return toActionError("forceMatch", error);
  }
}

/** The tier list, so the admin UI and the sort order cannot drift apart. */
export async function getTierOrder(): Promise<readonly string[]> {
  return TIER_ORDER;
}
