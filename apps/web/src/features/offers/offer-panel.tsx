"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatINR } from "@/features/physical-wall/money";
import { makeOffer } from "./actions";
import { minimumOfferPaise, VALIDITY_DAYS, type DemandSignal, type ValidityDays } from "./rules";

/**
 * The artwork page's offer panel: the public demand signal, plus the form.
 *
 * PRIVACY (Bible §44, rule 40): everything shown above the form is an
 * aggregate — a count, a low-high range, a recency. The props type has no
 * place to put a buyer id or an individual offer, so this component cannot
 * leak one even if a future caller tries to pass it.
 */
export function OfferPanel({
  artworkId,
  askingPricePaise,
  demand,
  signedIn,
  isOwner,
}: {
  artworkId: string;
  askingPricePaise: number;
  demand: DemandSignal;
  signedIn: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [rupees, setRupees] = useState("");
  const [validityDays, setValidityDays] = useState<ValidityDays>(7);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const floorPaise = minimumOfferPaise(askingPricePaise);

  function submit() {
    setError(null);
    const amountPaise = Math.round(Number(rupees) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      setError("Enter an amount.");
      return;
    }
    // Mirrors the server rule so the common mistake is caught without a round
    // trip. The server and the database both check it again.
    if (amountPaise < floorPaise) {
      setError(`Offers must be at least ${formatINR(floorPaise)}.`);
      return;
    }

    startTransition(async () => {
      const result = await makeOffer({ artworkId, amountPaise, validityDays });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <section className="border-hairline mt-6 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Offers</h2>

      {demand.offerCount === 0 ? (
        <p className="text-ink-muted mt-1 text-sm">No offers yet.</p>
      ) : (
        <div className="text-ink-muted mt-1 space-y-1 text-sm">
          <p>
            This artwork has received {demand.offerCount}{" "}
            {demand.offerCount === 1 ? "offer" : "offers"}.
          </p>
          {demand.lowPaise != null && demand.highPaise != null && (
            <p>
              Offer range:{" "}
              {demand.lowPaise === demand.highPaise
                ? formatINR(demand.lowPaise)
                : `${formatINR(demand.lowPaise)} – ${formatINR(demand.highPaise)}`}
            </p>
          )}
          {demand.latestOfferAt && (
            <p>Latest offer {relativeTime(new Date(demand.latestOfferAt))}.</p>
          )}
        </div>
      )}

      {done && (
        <p className="mt-3 text-sm text-green-700">
          Your offer has been sent. The artist can accept, decline or counter it.
        </p>
      )}

      {!isOwner && !done && (
        <>
          {!open ? (
            <button
              type="button"
              onClick={() => {
                if (!signedIn) {
                  router.push(`/sign-in?callbackUrl=/artwork/${artworkId}`);
                  return;
                }
                setOpen(true);
              }}
              className="border-hairline mt-3 rounded-full border px-4 py-2 text-sm hover:bg-black/5"
            >
              Make an offer
            </button>
          ) : (
            <div className="mt-3 space-y-3">
              <label className="block text-sm">
                Your offer (₹)
                <input
                  type="number"
                  min={Math.ceil(floorPaise / 100)}
                  value={rupees}
                  onChange={(event) => setRupees(event.target.value)}
                  className="border-hairline mt-1 w-full rounded border px-3 py-2 text-sm"
                />
              </label>
              <p className="text-ink-muted text-xs">
                Minimum {formatINR(floorPaise)} — 50% of the asking price.
              </p>

              <fieldset className="text-sm">
                <legend className="mb-1">Valid for</legend>
                <div className="flex gap-2">
                  {VALIDITY_DAYS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setValidityDays(days)}
                      aria-pressed={validityDays === days}
                      className={
                        validityDays === days
                          ? "border-ink rounded-full border px-3 py-1 text-xs font-semibold"
                          : "border-hairline text-ink-muted rounded-full border px-3 py-1 text-xs"
                      }
                    >
                      {days} days
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submit}
                  className="bg-ink rounded-full px-4 py-2 text-sm text-white"
                >
                  Send offer
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-ink-muted px-3 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}

/** "2 days ago" without pulling in a date library for one string. */
function relativeTime(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return `on ${date.toLocaleDateString("en-IN", { dateStyle: "medium" })}`;
}
