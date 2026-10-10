"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { user } from "@/lib/db/schema";
import {
  attempt,
  parseInput,
  PreconditionError,
  readSafely,
  type Result,
} from "@/features/physical-wall/actions/shared";

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new PreconditionError("Sign in first.");
  return session.user.id;
}

const PERSONAS = ["artist", "curator", "buyer"] as const;
export type OnboardingPersona = (typeof PERSONAS)[number];

const personaSchema = z.object({ persona: z.enum(PERSONAS) });

/**
 * Record the one-time "What brings you to ArtWall?" answer.
 *
 * Idempotent on purpose: once set, calling this again (a double submit, a
 * replayed request) just rewrites the same or a later choice rather than
 * erroring — there is no business reason to forbid someone from revisiting
 * /welcome and picking differently before it has routed them anywhere.
 */
export async function setOnboardingPersona(
  raw: z.input<typeof personaSchema>
): Promise<Result<OnboardingPersona>> {
  return attempt("setOnboardingPersona", async () => {
    const input = parseInput(personaSchema, raw);
    const userId = await getUserId();
    await db.update(user).set({ onboardingPersona: input.persona }).where(eq(user.id, userId));
    return input.persona;
  });
}

/** Null means "not yet asked" - see db/migrations/0060_user_onboarding_persona.sql. */
export async function getOnboardingPersona(): Promise<OnboardingPersona | null> {
  return readSafely("getOnboardingPersona", null, async () => {
    const userId = await getUserId();
    const [row] = await db
      .select({ onboardingPersona: user.onboardingPersona })
      .from(user)
      .where(eq(user.id, userId));
    return (row?.onboardingPersona as OnboardingPersona | null) ?? null;
  });
}
