"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { ROSTER_TAG } from "@/features/waitlist/roster";
import { getSql } from "@/lib/db";
import { checkRateLimit, clientIp, mostRestrictive, retryIn } from "@/lib/rate-limit";

export type AdminState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; message: string };

/** SEC-1.16: below this, ADMIN_PASSWORD is not the ~32 random bytes this
 * single shared-password mechanism needs to resist offline guessing. */
const ADMIN_PASSWORD_MIN_LENGTH = 32;

/**
 * Constant-time password comparison.
 *
 * A plain `===` on a secret leaks its length and, in principle, its prefix
 * through timing. SHA-256 hashing both sides first gives `timingSafeEqual` a
 * fixed-width input without padding or truncating either value — padding a
 * short secret out to a fixed width does not make it strong, and truncating a
 * long one silently caps how much of it is ever actually checked.
 */
function passwordMatches(supplied: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected.length < ADMIN_PASSWORD_MIN_LENGTH) return false;

  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Admin password attempts: 5 per 15 minutes per IP, and 30 per 15 minutes
 * across ALL IPs. The per-IP bucket stops one machine guessing; the global one
 * caps a distributed guesser at ~2,900 tries a day instead of unbounded. The
 * cost is that an attacker can lock the (single) admin out for 15 minutes,
 * which is the right trade for a password-only endpoint.
 */
const ADMIN_PER_IP = { limit: 5, windowMs: 15 * 60 * 1000 };
const ADMIN_GLOBAL = { limit: 30, windowMs: 15 * 60 * 1000 };

/**
 * Hide or restore a tile.
 *
 * Hiding rather than deleting: the artist keeps their founding number and their
 * place in the roster, and the action is reversible if it was a mistake. The
 * image stays in Cloudinary - a genuine takedown request should also delete the
 * asset, which is deliberately a separate, more considered step.
 *
 * Rate limited hard, because this endpoint accepts a password and would
 * otherwise be brute-forceable.
 */
export async function setTileStatus(
  _previous: AdminState,
  formData: FormData
): Promise<AdminState> {
  // Password-guarded: fails CLOSED if the limiter store is down (PERF-2.03).
  const limit = mostRestrictive(
    await Promise.all([
      checkRateLimit(`admin:ip:${clientIp(await headers())}`, ADMIN_PER_IP),
      checkRateLimit("admin:global", ADMIN_GLOBAL),
    ])
  );
  if (!limit.ok) {
    return {
      status: "error",
      message: limit.unavailable
        ? "Temporarily unavailable. Try again shortly."
        : `Too many attempts. Try again in ${retryIn(limit)}.`,
    };
  }

  const password = String(formData.get("password") ?? "");
  if (!passwordMatches(password)) {
    return { status: "error", message: "Wrong password." };
  }

  const parsed = z
    .object({
      founderNumber: z.coerce.number({ error: "Enter a valid founder number." }).int("Enter a valid founder number.").min(1, "Enter a valid founder number."),
      next: z.enum(["visible", "hidden"], { error: "Unknown action." }),
    })
    .safeParse({ founderNumber: formData.get("founderNumber"), next: formData.get("next") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const { founderNumber, next } = parsed.data;

  try {
    const sql = getSql();
    const rows = (await sql`
      update waitlist_entries
      set status = ${next}
      where founder_number = ${founderNumber}
      returning founder_number
    `) as { founder_number: number }[];

    if (rows.length === 0) {
      return { status: "error", message: `No artist with #${founderNumber}.` };
    }

    updateTag(ROSTER_TAG);
    return {
      status: "ok",
      message: `#${founderNumber} is now ${next === "hidden" ? "hidden from" : "visible on"} the wall.`,
    };
  } catch (error) {
    console.error("[admin] Could not update tile status", error);
    return { status: "error", message: "That didn't work. Check the logs." };
  }
}
