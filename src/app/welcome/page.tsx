import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/session";
import { getOnboardingPersona } from "@/features/onboarding/actions";
import { PersonaChoice } from "@/features/onboarding/persona-choice";

export const metadata: Metadata = {
  title: "Welcome to ArtWall",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The one-time "What brings you to ArtWall?" screen.
 *
 * Shown after sign-up/first sign-in instead of landing straight in Studio
 * (see src/app/studio/layout.tsx, which redirects here when the signed-in
 * user's onboardingPersona is still null). Already-answered users who land
 * here directly are sent on rather than asked again.
 */
export default async function WelcomePage() {
  await requireUser("/welcome");
  const persona = await getOnboardingPersona();
  if (persona) redirect(destinationFor(persona));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-5 pt-24 pb-24 sm:px-8 sm:pt-32">
      <div>
        <h1 className="font-heading text-display">What brings you to ArtWall?</h1>
        <p className="text-ink-muted mt-3 text-sm leading-6">
          This just points you to the right place to start — you can always do the others too.
        </p>
      </div>
      <PersonaChoice />
    </main>
  );
}

export function destinationFor(persona: string): string {
  if (persona === "artist") return "/studio/onboarding";
  if (persona === "curator") return "/curator/apply";
  return "/discover";
}
