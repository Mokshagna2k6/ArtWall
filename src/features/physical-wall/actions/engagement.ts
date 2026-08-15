"use server";

import { updateTag } from "next/cache";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { requireRole } from "@/features/physical-wall/authorize";
import { feedbackSchema, reactionSchema } from "@/features/physical-wall/schema";
import {
  fail,
  firstIssue,
  newId,
  ok,
  toActionError,
  WALL_TAG,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSql } from "@/lib/db";

/**
 * Reactions (F24) and post-exhibition feedback (F32).
 *
 * Reactions are anonymous and stored as aggregates, so there is no row tying a
 * tap to a person - which is what makes "no account needed" and "low PII" the
 * same decision rather than two competing ones.
 */

/**
 * A rotating rate-limit key.
 *
 * Hashed with the current hour so it changes on its own and cannot be used to
 * follow one visitor through an evening. Lives in memory for the window and is
 * never written down.
 */
async function rotatingKey(prefix: string): Promise<string> {
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "unknown";
  const hour = Math.floor(Date.now() / 3_600_000);
  return `${prefix}:${createHash("sha256").update(`${ip}:${hour}`).digest("hex").slice(0, 16)}`;
}

/**
 * Tap a reaction.
 *
 * Returns the new count so the UI can settle on the real number rather than
 * keeping its optimistic guess. Throttled hard: a burst is dampened before it
 * reaches the aggregate, because a demand signal that can be inflated by
 * holding down a button is not a demand signal.
 */
export async function react(
  artworkId: string,
  kind: string
): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  const parsed = reactionSchema.safeParse({ artworkId, kind });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const limit = checkRateLimit(await rotatingKey(`pw-react:${artworkId}`), {
    limit: 20,
    windowMs: 60 * 1000,
  });
  if (!limit.ok) {
    return { ok: false, message: "Easy — give it a moment." };
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      insert into pw_reactions (artwork_id, kind, count)
      values (${parsed.data.artworkId}, ${parsed.data.kind}, 1)
      on conflict (artwork_id, kind) do update
        set count = pw_reactions.count + 1, updated_at = now()
      returning count
    `) as { count: number }[];

    return { ok: true, count: Number(rows[0].count) };
  } catch (error) {
    console.error("[physical-wall] react", error);
    return { ok: false, message: "That didn't register." };
  }
}

/**
 * Submit the post-exhibition survey (F32).
 *
 * Tied to a booking the artist actually owns, and refused once answered - the
 * unique index does the enforcing, so a link opened twice from an email is a
 * clean message rather than a duplicate row.
 */
export async function submitFeedback(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");

    const parsed = feedbackSchema.safeParse({
      bookingId: formData.get("bookingId"),
      rating: formData.get("rating"),
      nps: formData.get("nps") || undefined,
      note: formData.get("note") || undefined,
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { bookingId, rating, nps, note } = parsed.data;
    const sql = getSql();

    const owned = (await sql`
      select id from pw_bookings
      where id = ${bookingId} and artist_id = ${actor.id}
      limit 1
    `) as { id: string }[];
    if (owned.length === 0) return fail("That booking isn't yours.");

    const inserted = (await sql`
      insert into pw_feedback (id, booking_id, artist_id, rating, nps, note)
      values (${newId("fb")}, ${bookingId}, ${actor.id}, ${rating},
              ${nps ?? null}, ${note ?? null})
      on conflict (booking_id) do nothing
      returning id
    `) as { id: string }[];

    if (inserted.length === 0) {
      return fail("You've already sent feedback for this exhibition. Thank you.");
    }

    updateTag(WALL_TAG);
    return ok("Thank you — this goes straight into how we run the next one.");
  } catch (error) {
    return toActionError("submitFeedback", error);
  }
}
