"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { timingSafeEqual } from "node:crypto";

import { ROSTER_TAG } from "@/features/waitlist/roster";
import { getSql } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

export type AdminState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; message: string };

/**
 * Constant-time password comparison.
 *
 * A plain `===` on a secret leaks its length and, in principle, its prefix
 * through timing. Hashing both sides to a fixed width first also stops
 * `timingSafeEqual` throwing on mismatched lengths.
 */
function passwordMatches(supplied: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;

  const a = Buffer.from(supplied.padEnd(64).slice(0, 64));
  const b = Buffer.from(expected.padEnd(64).slice(0, 64));
  return timingSafeEqual(a, b);
}

async function clientKey(): Promise<string> {
  const headerList = await headers();
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "unknown"
  );
}

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
  const limit = checkRateLimit(`admin:${await clientKey()}`, {
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!limit.ok) {
    return { status: "error", message: "Too many attempts. Wait a while." };
  }

  const password = String(formData.get("password") ?? "");
  if (!passwordMatches(password)) {
    return { status: "error", message: "Wrong password." };
  }

  const founderNumber = Number(formData.get("founderNumber"));
  const next = String(formData.get("next"));

  if (!Number.isInteger(founderNumber) || founderNumber < 1) {
    return { status: "error", message: "Enter a valid founder number." };
  }
  if (next !== "visible" && next !== "hidden") {
    return { status: "error", message: "Unknown action." };
  }

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
