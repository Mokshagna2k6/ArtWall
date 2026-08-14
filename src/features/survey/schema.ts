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

/** The closed list of failures, matching the six stages on the services page. */
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
] as const;

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

export const surveySchema = z.object({
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
   * At least one, so a blank submission cannot pollute the results. Capped at
   * the length of the option list because the client posts one value per
   * checkbox and a hostile caller could otherwise post thousands.
   */
  painPoints: z
    .array(z.enum(painPoints))
    .min(1, "Please choose at least one.")
    .max(painPoints.length),

  biggestProblem: z.string().trim().max(400).optional().or(z.literal("")),
  fairCommission: z.enum(commissionBands).optional().or(z.literal("")),
  earnsFromArt: z.enum(incomeBands).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),

  /** Honeypot. Real people never see this field, so anything in it is a bot. */
  website: z.string().max(0).optional().or(z.literal("")),
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
