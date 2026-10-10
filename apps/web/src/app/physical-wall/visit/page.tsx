import type { Metadata } from "next";

import { siteConfig } from "@/config/site";
import { VisitorRegisterForm } from "@/features/physical-wall/components/visitor-register";
import { getSettings } from "@/features/physical-wall/data/catalogs";

export const metadata: Metadata = {
  title: "You're here",
  description:
    "Register your visit to the ArtWall at Ric Platter and get 10% off your bill.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Walk-in registration (F26).
 *
 * Reached from a code on the table or at the door, so it has to work for
 * someone standing up, on a phone, in a restaurant. One screen, two fields,
 * consent stated in the sentence rather than behind a link.
 */
export default async function VisitPage() {
  const settings = await getSettings();
  const perkPct = settings.perkDiscountBp / 100;

  return (
    <main className="mx-auto max-w-lg px-5 pt-24 pb-20 sm:px-8 sm:pt-32">
      <p className="text-signal text-eyebrow">Ric Platter</p>
      <h1 className="font-heading text-display mt-4 text-balance">
        Welcome. Have {perkPct}% off.
      </h1>
      <p className="text-ink-muted mt-4 text-sm leading-6">
        Register your visit and we&rsquo;ll give you a code. Show it when you
        pay and Ric Platter takes {perkPct}% off your bill. Scanning the artwork
        labels while you&rsquo;re here tells us which pieces people actually
        stop for — which is how artists get paid more fairly.
      </p>

      <div className="mt-10">
        <VisitorRegisterForm qrBase={siteConfig.url} />
      </div>

      <p className="text-ink-muted mt-8 text-xs leading-5">
        ArtWall is the data fiduciary for what you enter here. Ric Platter bills
        your food directly — we never take payment for it, and anything to do
        with the food itself is theirs to put right.
      </p>
    </main>
  );
}
