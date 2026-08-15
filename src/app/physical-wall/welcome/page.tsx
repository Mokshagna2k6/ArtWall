import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireRolePage } from "@/features/physical-wall/authorize";
import { OnboardingForm } from "@/features/physical-wall/components/onboarding-form";
import { needsOnboarding } from "@/features/physical-wall/data/consent";

export const metadata: Metadata = {
  title: "Welcome",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The consent gate (F31).
 *
 * Every route into an ArtWall account passes through here once: the email
 * sign-up form and the Google redirect both land on it, which is the point —
 * OAuth cannot carry checkboxes, so a consent step baked into the sign-up form
 * would silently skip every Google account.
 *
 * Already onboarded? Straight through. This page is a gate, not a stop.
 */
export default async function WelcomePage({
  searchParams,
}: PageProps<"/physical-wall/welcome">) {
  const actor = await requireRolePage("artist", "/physical-wall/welcome");

  if (!(await needsOnboarding(actor.id))) {
    const params = await searchParams;
    const next =
      typeof params.next === "string" && params.next.startsWith("/")
        ? params.next
        : "/physical-wall";
    redirect(next);
  }

  return (
    <main className="mx-auto max-w-2xl px-5 pt-24 pb-24 sm:px-8 sm:pt-32">
      <p className="text-signal text-eyebrow">Almost there</p>
      <h1 className="font-heading text-display mt-3 text-balance">
        A few choices, then the wall.
      </h1>
      <p className="text-ink-muted mt-4 max-w-xl text-sm leading-6">
        Indian data-protection law says consent has to be specific, informed and
        unbundled — which suits us, because we would rather ask you plainly than
        bury it in terms nobody reads. Each question below is separate, and every
        one of them is reversible.
      </p>

      <div className="mt-10">
        <OnboardingForm name={actor.name} />
      </div>
    </main>
  );
}
