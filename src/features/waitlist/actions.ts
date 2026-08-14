"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";

import { ROSTER_TAG } from "@/features/waitlist/roster";

import {
  waitlistSchema,
  type WaitlistInput,
  type WaitlistState,
} from "@/features/waitlist/schema";
import { saveWaitlistEntry } from "@/features/waitlist/store";
import { DatabaseNotConfiguredError } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

const RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

/**
 * Best-effort client identity for rate limiting.
 *
 * Proxy headers are spoofable, so this is a speed bump rather than an identity.
 * On Vercel `x-forwarded-for` is set by the platform edge and the client cannot
 * override it; behind other proxies, confirm the same before trusting it.
 */
async function clientKey(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown"
  );
}

/**
 * Join the founding roster.
 *
 * Security posture:
 *  - Every field is re-validated server-side with the shared schema. Client
 *    validation is UX only; this endpoint assumes hostile input.
 *  - A honeypot field rejects the common bot case with no user-visible cost
 *    and no CAPTCHA (which would be a real accessibility tax on artists).
 *  - Rate limited per client, per window.
 *  - Errors returned to the client are deliberately generic; the specific
 *    cause is logged server-side. Leaking "webhook returned 403" would tell an
 *    attacker about our infrastructure.
 *  - Next.js Server Actions carry built-in CSRF protection (origin checking),
 *    so no separate token is needed here.
 */
export async function joinWaitlist(
  _previous: WaitlistState,
  formData: FormData
): Promise<WaitlistState> {
  // A place on the wall belongs to a person, so it requires an account. The
  // page already redirects signed-out visitors to sign in; this is the check
  // that actually enforces it, because a Server Action is a public endpoint
  // and the page-level redirect is only a courtesy.
  const user = await getSessionUser();
  if (!user) {
    return {
      status: "error",
      message: "Please sign in to take your place on the wall.",
    };
  }

  const raw = {
    name: formData.get("name"),
    // The address on the roster is the one the account was verified with, not
    // whatever was typed into the form - otherwise one account could claim
    // places under any number of addresses.
    email: user.email,
    role: formData.get("role"),
    practice: formData.get("practice") || undefined,
    city: formData.get("city") ?? "",
    website: formData.get("website") ?? "",
    artworkUrl: formData.get("artworkUrl") ?? "",
    artworkPublicId: formData.get("artworkPublicId") ?? "",
    artworkWidth: formData.get("artworkWidth") || undefined,
    artworkHeight: formData.get("artworkHeight") || undefined,
    selfieUrl: formData.get("selfieUrl") ?? "",
    selfiePublicId: formData.get("selfiePublicId") ?? "",
    artworkTitle: formData.get("artworkTitle") ?? "",
    quote: formData.get("quote") ?? "",
    // An unticked checkbox posts nothing, so absence is a clear "no".
    foundingMember: formData.get("foundingMember") === "on",
  };

  const parsed = waitlistSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof WaitlistInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof WaitlistInput | undefined;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }

    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors,
    };
  }

  // Honeypot tripped - respond like success so bots learn nothing from the
  // difference, but persist nothing. The number is not real and never reaches
  // the database.
  if (parsed.data.website) {
    return { status: "success", founderNumber: 0, name: parsed.data.name };
  }

  const limit = checkRateLimit(`waitlist:${await clientKey()}`, RATE_LIMIT);
  if (!limit.ok) {
    return {
      status: "error",
      message: `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`,
    };
  }

  const headerList = await headers();

  try {
    const { founderNumber } = await saveWaitlistEntry({
      ...parsed.data,
      userId: user.id,
      userAgent: headerList.get("user-agent"),
    });

    // `updateTag` rather than `revalidateTag`: this is read-your-own-writes.
    // An artist who just joined must see a count that includes them, not a
    // stale-while-revalidate number that still shows the old total.
    updateTag(ROSTER_TAG);

    return { status: "success", founderNumber, name: parsed.data.name };
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      console.error(
        "[waitlist] DATABASE_URL is not set, submission was NOT saved."
      );
    } else {
      console.error("[waitlist] Failed to save entry", error);
    }

    // Deliberately generic: the specific cause is logged server-side. Telling a
    // caller "the database rejected that" is free reconnaissance.
    return {
      status: "error",
      message:
        "We couldn't save your place just now. Please try again in a moment.",
    };
  }
}
