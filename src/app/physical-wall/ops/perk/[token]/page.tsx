import type { Metadata } from "next";
import Link from "next/link";

import { previewPerk } from "@/features/physical-wall/actions/perk";
import { requireRolePage } from "@/features/physical-wall/authorize";
import { PerkCounter } from "@/features/physical-wall/components/perk-counter";

export const metadata: Metadata = {
  title: "Counter",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Where a scanned coupon lands (RP01).
 *
 * Staff-only. A customer who scans their own code gets sent here too and sees a
 * sign-in prompt — which is the right outcome: the coupon is not self-service,
 * and it is better that they hand the phone to the till than hit a dead end.
 *
 * Eligibility is resolved before anything renders, so the person at the till
 * learns "already redeemed" before they start typing a bill total rather than
 * after.
 */
export default async function PerkCounterPage({
  params,
}: PageProps<"/physical-wall/ops/perk/[token]">) {
  const { token } = await params;
  await requireRolePage("staff", `/physical-wall/ops/perk/${token}`);

  const result = await previewPerk(token);

  return (
    <main className="mx-auto max-w-md px-5 pt-24 pb-24 sm:px-8 sm:pt-32">
      <p className="text-signal text-eyebrow">Ric Platter counter</p>

      <div className="mt-6">
        {result.ok ? (
          <PerkCounter
            token={token}
            principalName={result.preview.principalName}
            principalType={result.preview.principalType}
            discountPct={result.preview.discountBp / 100}
            eligible={result.preview.eligible}
            reason={result.preview.reason}
          />
        ) : (
          <div className="border-hairline rounded-md border p-6">
            <h1 className="font-heading text-section">
              That code doesn&rsquo;t work
            </h1>
            <p className="text-ink-muted mt-3 text-sm leading-6">
              {result.message}
            </p>
            <p className="text-ink-muted mt-3 text-sm leading-6">
              Charge the bill in full. If the customer thinks this is wrong,
              take their name and we&rsquo;ll sort it out afterwards.
            </p>
          </div>
        )}
      </div>

      <Link
        href="/physical-wall/ops"
        className="text-ink-muted hover:text-ink text-small mt-8 inline-flex underline underline-offset-4"
      >
        Back to the install queue
      </Link>
    </main>
  );
}
