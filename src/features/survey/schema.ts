import { z } from "zod";

import { practices } from "@/features/waitlist/schema";

/**
 * The pain-point survey.
 *
 * Deliberately short. This is not market research, it is a way of asking
 * artists which of the twenty-four failures they have actually lived through,
 * so the roadmap is ordered by what hurts rather than by what demos well.
 *
 * Everything except the pain points themselves is optional, and nothing here
 * requires an account - an artist who will not sign up still has something
 * worth telling us.
 */

export const surveyRoles = ["artist", "collector", "gallery", "other"] as const;

/**
 * One free-text escape hatch, shared verbatim across every pain-point list
 * below. Keeping the label identical means the form only needs one "which
 * option is the other one" check, not one per list.
 */
export const OTHER_PAIN_POINT = "Something else (tell us below)" as const;

/**
 * The closed list of failures artists face, matching the six stages on the
 * services page, plus a free-text escape hatch - someone whose real problem
 * is not on this list still deserves to be heard, not forced into the
 * nearest-sounding checkbox.
 */
export const painPoints = [
  "I have no way to prove a work is mine",
  "Galleries and middlemen take too large a cut",
  "I cannot afford to exhibit",
  "There is nowhere near me to show work",
  "My work has been copied or forged",
  "Buyers do not trust that the work is authentic",
  "I have no tools in my own language",
  "I never see anything when my work is resold",
  "I cannot get paid safely or on time",
  "I have no way to reach collectors outside my city",
  OTHER_PAIN_POINT,
] as const;

/** What gets in the way of a collector actually buying. */
export const collectorPainPoints = [
  "I don't know how to find artists whose work I'd actually want",
  "I can't tell if a work is genuine or authentic",
  "Prices aren't clear, or feel made up on the spot",
  "I don't trust that payment or shipping will go smoothly",
  "There's no one to ask questions before I commit to buying",
  OTHER_PAIN_POINT,
] as const;

/** What gets in the way of a gallery or curator doing their work. */
export const galleryPainPoints = [
  "I have no good way to discover new artists worth showing",
  "Agreeing commission terms with artists is slow or awkward",
  "I don't have tools to actually curate or organise a show",
  "Provenance and authenticity are hard to verify before committing",
  "Logistics (shipping, insurance, framing) eat the time I'd rather spend curating",
  OTHER_PAIN_POINT,
] as const;

/** Every pain-point list that can appear on the form, keyed by `role`. */
export const painPointsByRole = {
  artist: painPoints,
  collector: collectorPainPoints,
  gallery: galleryPainPoints,
  // "Someone else" has no persona-specific list; they still get to say what's
  // wrong in `biggestProblem` and `otherPainPointDetail`.
  other: [OTHER_PAIN_POINT] as const,
} satisfies Record<(typeof surveyRoles)[number], readonly string[]>;

export const commissionBands = [
  "Under 10%",
  "10–20%",
  "20–30%",
  "More than 30%",
  "I don't know",
] as const;

export const incomeBands = [
  "All of my income",
  "Most of my income",
  "Some of my income",
  "None yet",
  "Prefer not to say",
] as const;

/** The widest possible set of pain-point strings, across every persona. */
const anyPainPoint = z.enum([
  ...new Set([...painPoints, ...collectorPainPoints, ...galleryPainPoints]),
] as [string, ...string[]]);

export const surveySchema = z
  .object({
    role: z.enum(surveyRoles).default("artist"),
    practice: z.enum(practices).optional().or(z.literal("")),
    city: z.string().trim().max(80).optional().or(z.literal("")),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .pipe(z.email("That doesn't look like an email address."))
      .optional()
      .or(z.literal("")),

    /**
     * At least one, so a blank submission cannot pollute the results. Capped
     * generously because the client posts one value per checkbox and a
     * hostile caller could otherwise post thousands; which exact options are
     * valid for the chosen role is checked below, once `role` is known.
     */
    painPoints: z
      .array(anyPainPoint)
      .min(1, "Please choose at least one.")
      .max(20),

    /**
     * Free text, required when "Something else" is one of the ticked boxes -
     * enforced below, once `painPoints` is known. This is the actual answer
     * for anyone the fixed lists don't fit.
     */
    otherPainPointDetail: z.string().trim().max(300).optional().or(z.literal("")),

    biggestProblem: z.string().trim().max(400).optional().or(z.literal("")),
    fairCommission: z.enum(commissionBands).optional().or(z.literal("")),
    earnsFromArt: z.enum(incomeBands).optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),

    /** Honeypot. Real people never see this field, so anything in it is a bot. */
    website: z.string().max(0).optional().or(z.literal("")),
  })
  .check((ctx) => {
    const { role, painPoints: chosen, otherPainPointDetail } = ctx.value;
    const allowed = new Set<string>(painPointsByRole[role]);

    for (const point of chosen) {
      if (!allowed.has(point)) {
        ctx.issues.push({
          code: "custom",
          message: "Please choose at least one.",
          input: ctx.value,
          path: ["painPoints"],
        });
        break;
      }
    }

    if (chosen.includes(OTHER_PAIN_POINT) && !otherPainPointDetail) {
      ctx.issues.push({
        code: "custom",
        message: "Tell us what it is.",
        input: ctx.value,
        path: ["otherPainPointDetail"],
      });
    }
  });

export type SurveyInput = z.infer<typeof surveySchema>;

export type SurveyState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<Record<keyof SurveyInput, string>>;
    };
