"use server";

import { headers } from "next/headers";

import {
  surveySchema,
  type SurveyInput,
  type SurveyState,
} from "@/features/survey/schema";
import { saveSurveyResponse } from "@/features/survey/store";
import { DatabaseNotConfiguredError } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

const RATE_LIMIT = { limit: 6, windowMs: 10 * 60 * 1000 };

async function clientKey(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown"
  );
}

/**
 * Record a pain-point survey response.
 *
 * Open to signed-out visitors by design: an artist who will not create an
 * account still has something worth telling us, and gating this would bias the
 * results towards the people who already trust us.
 *
 * Security posture:
 *  - Re-validated server-side with the shared schema; client validation is UX.
 *  - Honeypot rejects the common bot case without a CAPTCHA, which would be a
 *    real accessibility tax on this audience.
 *  - Rate limited per client, per window.
 *  - Errors to the client are generic; the cause is logged server-side.
 *  - Server Actions carry origin-checked CSRF protection already.
 */
export async function submitSurvey(
  _previous: SurveyState,
  formData: FormData
): Promise<SurveyState> {
  const raw = {
    role: formData.get("role") ?? "artist",
    practice: formData.get("practice") ?? "",
    city: formData.get("city") ?? "",
    email: formData.get("email") ?? "",
    // One entry per ticked checkbox, so this is read as a list rather than a
    // single value.
    painPoints: formData.getAll("painPoints"),
    biggestProblem: formData.get("biggestProblem") ?? "",
    fairCommission: formData.get("fairCommission") ?? "",
    earnsFromArt: formData.get("earnsFromArt") ?? "",
    notes: formData.get("notes") ?? "",
    website: formData.get("website") ?? "",
  };

  const parsed = surveySchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof SurveyInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof SurveyInput | undefined;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return {
      status: "error",
      message: "Please check the highlighted answers.",
      fieldErrors,
    };
  }

  // Honeypot tripped - answer like success so bots learn nothing, save nothing.
  if (parsed.data.website) return { status: "success" };

  const limit = checkRateLimit(`survey:${await clientKey()}`, RATE_LIMIT);
  if (!limit.ok) {
    return {
      status: "error",
      message: `Too many submissions. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`,
    };
  }

  const [user, headerList] = await Promise.all([getSessionUser(), headers()]);

  try {
    await saveSurveyResponse({
      ...parsed.data,
      userId: user?.id ?? null,
      // A signed-in answer is attributed to the account's own address, so the
      // two can never disagree.
      email: user?.email ?? parsed.data.email,
      userAgent: headerList.get("user-agent"),
    });

    return { status: "success" };
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      console.error("[survey] DATABASE_URL is not set, nothing was saved.");
    } else {
      console.error("[survey] Failed to save response", error);
    }
    return {
      status: "error",
      message:
        "We couldn't record that just now. Please try again in a moment.",
    };
  }
}
