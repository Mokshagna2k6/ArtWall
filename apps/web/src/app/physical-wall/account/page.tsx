import type { Metadata } from "next";

import { requireOnboardedPage } from "@/features/physical-wall/authorize";
import { RightsCentre } from "@/features/physical-wall/components/rights-centre";
import {
  consentHistory,
  getAccountFacts,
  liveConsents,
} from "@/features/physical-wall/data/consent";

export const metadata: Metadata = {
  title: "Your data",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The data-principal rights centre (DPDP §5.3).
 *
 * One page, because a person exercising a right should not have to hunt for it
 * across a settings tree. The Act names six rights and all six live here:
 * access, correction, erasure, grievance, nomination and withdrawal.
 */
export default async function AccountPage() {
  const actor = await requireOnboardedPage("artist", "/physical-wall/account");

  const [facts, live, history] = await Promise.all([
    getAccountFacts(actor.id),
    liveConsents(actor.id),
    consentHistory(actor.id),
  ]);

  if (!facts) {
    return (
      <main className="mx-auto max-w-2xl px-5 pt-24 pb-24 sm:px-8 sm:pt-32">
        <h1 className="font-heading text-display">We can&rsquo;t load that.</h1>
        <p className="text-ink-muted mt-4 text-sm leading-6">
          Your account details couldn&rsquo;t be read. Try again shortly.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 pt-24 pb-24 sm:px-8 sm:pt-32">
      <p className="text-signal text-eyebrow">Your data</p>
      <h1 className="font-heading text-display mt-3 text-balance">
        What we hold, and what you can do about it.
      </h1>
      <p className="text-ink-muted mt-4 max-w-2xl text-sm leading-6">
        Every right the Digital Personal Data Protection Act gives you is a
        working control on this page — not a form we promise to read. Withdrawing
        a consent takes exactly as long as giving it did.
      </p>

      {facts.foundingMember && (
        <p className="border-hairline text-ink-muted mt-6 rounded-md border p-4 text-sm leading-6">
          You&rsquo;re a founding member, which moves you up the waitlist when
          the wall is full.
        </p>
      )}

      <div className="mt-12">
        <RightsCentre
          facts={facts}
          liveConsents={live.map((c) => c.purpose)}
          history={history}
          email={actor.email}
        />
      </div>
    </main>
  );
}
