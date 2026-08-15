"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Circle, CheckCircle2 } from "lucide-react";

import { IDLE } from "@/features/physical-wall/action-state";
import {
  quoteBooking,
  reserveBooking,
} from "@/features/physical-wall/actions/booking";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import { Stepper } from "@/features/physical-wall/components/stepper";
import { WallGrid } from "@/features/physical-wall/components/wall-grid";
import { formatINR } from "@/features/physical-wall/money";
import { DURATION_TIERS, type Quote } from "@/features/physical-wall/pricing";
import type { Addon, SlotWithCatalog } from "@/features/physical-wall/types";

/**
 * The artist's booking flow (F06–F09, F11, F20).
 *
 * Five steps with a summary that never leaves the screen, following the
 * prototype. The step structure is not decoration: choosing a wall position,
 * a duration, a piece to hang and a set of add-ons are four genuinely separate
 * decisions, and putting them on one page — which is what this was before —
 * meant the price moved for reasons the artist could not see.
 *
 * Two rules the layout enforces:
 *
 *  - **The total is always visible.** It updates as the basket changes, GST
 *    included, so "all fees + GST shown before pay" is true at every step and
 *    not only on the last one.
 *  - **You cannot skip forward, but you can always go back.** Completed steps
 *    stay clickable so a price can be re-checked without losing the basket.
 *
 * The price here is a preview. The server re-computes it inside the transaction
 * that holds the slots, so a tampered form buys nothing.
 */

interface Artwork {
  id: string;
  title: string;
}

const STEPS = ["Slots", "Dates", "Artwork", "Add-ons", "Agreement"] as const;

export function BookingFlow({
  slots,
  rowCount,
  colCount,
  addons,
  artworks,
  today,
  venueName,
  refundPercentage,
  gstRatePct,
}: {
  slots: SlotWithCatalog[];
  rowCount: number;
  colCount: number;
  addons: Addon[];
  artworks: Artwork[];
  today: string;
  venueName: string;
  refundPercentage: number | null;
  gstRatePct: number;
}) {
  const [step, setStep] = useState(1);
  const [furthest, setFurthest] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [durationDays, setDurationDays] = useState(7);
  const [startDate, setStartDate] = useState(today);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [artworkId, setArtworkId] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [pricing, startPricing] = useTransition();

  const [state, formAction] = useActionState(reserveBooking, IDLE);

  // Re-price whenever the basket changes. The empty-basket case is derived in
  // render rather than cleared here — a setState called synchronously inside an
  // effect costs an extra render pass on every deselection for no benefit.
  useEffect(() => {
    if (selected.length === 0) return;

    let cancelled = false;
    startPricing(async () => {
      const result = await quoteBooking({
        slotIds: selected,
        durationDays,
        startDate,
        addonIds,
      });
      if (cancelled) return;
      if (result.ok) {
        setQuote(result.quote);
        setQuoteError(null);
      } else {
        setQuote(null);
        setQuoteError(result.message);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selected, durationDays, startDate, addonIds]);

  const shownQuote = selected.length > 0 ? quote : null;
  const shownError = selected.length > 0 ? quoteError : null;

  const artistAddons = addons.filter(
    (addon) => addon.appliesTo === "artist" || addon.appliesTo === "both"
  );
  const chosenSlots = slots.filter((slot) => selected.includes(slot.id));
  const available = slots.filter((slot) => slot.state === "available").length;

  function go(next: number) {
    setStep(next);
    setFurthest((f) => Math.max(f, next));
  }

  function toggleSlot(slotId: string) {
    setSelected((current) =>
      current.includes(slotId)
        ? current.filter((id) => id !== slotId)
        : [...current, slotId]
    );
  }

  // The reservation succeeded: the flow is over and the confirmation replaces
  // it entirely, rather than leaving a live form behind a success message.
  if (state.status === "ok") {
    return (
      <BookingConfirmed
        slots={chosenSlots.map((slot) => slot.label)}
        durationDays={durationDays}
        startDate={startDate}
        totalPaise={shownQuote?.totalPaise ?? 0}
        venueName={venueName}
        message={state.message}
      />
    );
  }

  const canContinue =
    step === 1 ? selected.length > 0 : step === 5 ? agreed : true;

  return (
    <div className="flex flex-col gap-8">
      <Stepper steps={STEPS} current={step} furthest={furthest} onJump={go} />

      <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_19rem]">
        {/* Everything the server needs, regardless of which step is on screen. */}
        {selected.map((slotId) => (
          <input key={slotId} type="hidden" name="slotIds" value={slotId} />
        ))}
        {addonIds.map((addonId) => (
          <input key={addonId} type="hidden" name="addonIds" value={addonId} />
        ))}
        <input type="hidden" name="startDate" value={startDate} />
        <input type="hidden" name="durationDays" value={durationDays} />
        <input type="hidden" name="artworkId" value={artworkId} />

        <div className="border-hairline min-w-0 rounded-md border p-5 sm:p-6">
          {step === 1 && (
            <section>
              <h2 className="font-heading text-section">Choose your position</h2>
              <p className="text-ink-muted mt-2 text-sm leading-6">
                {available} of {slots.length} slots open. Each is drawn at its
                real proportions — prices are per day, before duration discounts.
              </p>
              <div className="mt-6">
                <WallGrid
                  slots={slots}
                  rowCount={rowCount}
                  colCount={colCount}
                  mode="select"
                  selected={selected}
                  onToggle={toggleSlot}
                />
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <h2 className="font-heading text-section">How long for?</h2>
              <p className="text-ink-muted mt-2 text-sm leading-6">
                Longer stays cost less per day.
              </p>

              <div className="mt-6 max-w-sm">
                <Field label="Starting" htmlFor="startDate-input">
                  <input
                    id="startDate-input"
                    type="date"
                    min={today}
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>

              <ul className="mt-6 flex flex-col gap-2">
                {[...DURATION_TIERS].reverse().map((tier) => {
                  const on = durationDays === tier.minDays;
                  const off = Math.round((1 - tier.discountBp / 10000) * 100);
                  return (
                    <li key={tier.minDays}>
                      <button
                        type="button"
                        onClick={() => setDurationDays(tier.minDays)}
                        aria-pressed={on}
                        className={`flex w-full items-center justify-between gap-4 rounded-md border px-4 py-3 text-left text-sm transition-colors ${
                          on ? "border-ink bg-band" : "border-hairline-strong hover:border-ink"
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          {on ? (
                            <CheckCircle2 className="text-ink size-4 shrink-0" aria-hidden />
                          ) : (
                            <Circle className="text-ink-muted size-4 shrink-0" aria-hidden />
                          )}
                          <span className="font-medium">{tier.label}</span>
                        </span>
                        <span className="text-ink-muted">
                          {off > 0 ? `${off}% off per day` : "standard rate"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {step === 3 && (
            <section>
              <h2 className="font-heading text-section">What are you hanging?</h2>
              <p className="text-ink-muted mt-2 text-sm leading-6">
                You can decide later — but the work has to be attached before a
                staff member can install it.
              </p>

              <div className="mt-6 max-w-md">
                <Field label="Artwork" htmlFor="artworkId-select">
                  <select
                    id="artworkId-select"
                    value={artworkId}
                    onChange={(event) => setArtworkId(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Decide later</option>
                    {artworks.map((artwork) => (
                      <option key={artwork.id} value={artwork.id}>
                        {artwork.title}
                      </option>
                    ))}
                  </select>
                </Field>

                {artworks.length === 0 && (
                  <p className="border-hairline text-ink-muted mt-4 rounded-md border border-dashed p-4 text-sm leading-6">
                    You haven&rsquo;t catalogued any work yet. Book the dates
                    now — you can attach a piece from{" "}
                    <Link
                      href="/physical-wall/bookings"
                      className="underline underline-offset-4"
                    >
                      your bookings
                    </Link>{" "}
                    before you install.
                  </p>
                )}
              </div>
            </section>
          )}

          {step === 4 && (
            <section>
              <h2 className="font-heading text-section">Anything else?</h2>
              <p className="text-ink-muted mt-2 text-sm leading-6">
                Optional. Priced as one-off items, not per day or per slot.
              </p>

              <ul className="mt-6 flex flex-col gap-2">
                {artistAddons.map((addon) => {
                  const on = addonIds.includes(addon.id);
                  return (
                    <li key={addon.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setAddonIds((current) =>
                            current.includes(addon.id)
                              ? current.filter((id) => id !== addon.id)
                              : [...current, addon.id]
                          )
                        }
                        className={`flex w-full items-center justify-between gap-4 rounded-md border px-4 py-3 text-left text-sm transition-colors ${
                          on ? "border-ink bg-band" : "border-hairline-strong hover:border-ink"
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          {on ? (
                            <CheckCircle2 className="text-ink size-4 shrink-0" aria-hidden />
                          ) : (
                            <Circle className="text-ink-muted size-4 shrink-0" aria-hidden />
                          )}
                          <span className="font-medium">{addon.label}</span>
                        </span>
                        <span className="tabular-nums">
                          {formatINR(addon.pricePaise)}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {artistAddons.length === 0 && (
                  <li className="text-ink-muted text-sm">
                    No add-ons are on offer at the moment.
                  </li>
                )}
              </ul>
            </section>
          )}

          {step === 5 && (
            <section>
              <h2 className="font-heading text-section">
                The exhibition agreement
              </h2>
              <p className="text-ink-muted mt-2 text-sm leading-6">
                Generated from this booking. Read it — the version you tick is
                the version that governs, including the refund terms.
              </p>

              <div className="border-hairline bg-band mt-6 max-h-72 overflow-y-auto rounded-md border p-5 text-sm leading-7">
                <p className="text-ink font-medium">
                  ARTWALL LABS — EXHIBITION AGREEMENT
                </p>
                <p className="text-ink-muted mt-3">
                  <strong className="text-ink">1. Slots.</strong>{" "}
                  {chosenSlots.map((slot) => slot.label).join(", ") || "—"} at{" "}
                  {venueName}, for {durationDays} day
                  {durationDays === 1 ? "" : "s"} from {startDate}.
                </p>
                <p className="text-ink-muted mt-2">
                  <strong className="text-ink">2. Fee.</strong>{" "}
                  {shownQuote ? formatINR(shownQuote.totalPaise) : "—"},
                  inclusive of add-ons and {gstRatePct}% GST under GSTIN
                  08ABFCA1595D1ZR.
                </p>
                <p className="text-ink-muted mt-2">
                  <strong className="text-ink">3. Copyright.</strong> You retain
                  every right in your work. ArtWall takes a limited licence to
                  display and market it for the duration of this exhibition —
                  never an assignment.
                </p>
                <p className="text-ink-muted mt-2">
                  <strong className="text-ink">4. Sale and resale.</strong> If
                  the work sells through ArtWall, commission is 15%. On any
                  future resale a 4% royalty flows to you and 1% to the platform.
                </p>
                <p className="text-ink-muted mt-2">
                  <strong className="text-ink">5. Condition and liability.</strong>{" "}
                  Staff photograph the work on arrival and on removal. Insuring
                  the physical piece remains yours.
                </p>
                <p className="text-ink-muted mt-2">
                  <strong className="text-ink">6. Cancellation.</strong>{" "}
                  {refundPercentage === null
                    ? "No refund policy has been published yet — ask us before booking."
                    : `${refundPercentage}% of the fee is refunded on cancellation, whenever you cancel. One rule, applied the same way to everyone.`}
                </p>
              </div>

              <label className="mt-5 flex cursor-pointer gap-3 text-sm leading-6">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="mt-1 size-4 shrink-0"
                />
                <span>
                  I have read the agreement above and I sign it electronically.
                </span>
              </label>
            </section>
          )}

          <div className="border-hairline mt-8 flex items-center justify-between gap-4 border-t pt-5">
            <button
              type="button"
              onClick={() => go(step - 1)}
              disabled={step === 1}
              className="text-ink-muted hover:text-ink text-small inline-flex h-10 items-center gap-2 disabled:invisible"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </button>

            {step < STEPS.length ? (
              <button
                type="button"
                onClick={() => go(step + 1)}
                disabled={!canContinue}
                className="bg-ember text-wall-paper hover:bg-ember-glow text-small inline-flex h-10 items-center gap-2 rounded-md px-5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
                <ArrowRight className="size-4" aria-hidden />
              </button>
            ) : (
              <div className="flex flex-col items-end gap-2">
                <SubmitButton>
                  Sign and hold{" "}
                  {shownQuote ? `· ${formatINR(shownQuote.totalPaise)}` : ""}
                </SubmitButton>
              </div>
            )}
          </div>

          {step === 5 && (
            <div className="mt-3">
              <FormStatus state={state} />
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="border-hairline rounded-md border p-5">
            <p className="text-label text-ink-muted tracking-wider uppercase">
              Your booking
            </p>

            {selected.length === 0 ? (
              <p className="text-ink-muted mt-4 text-sm leading-6">
                Pick a slot to see what it costs.
              </p>
            ) : shownError ? (
              <p className="text-destructive mt-4 text-sm leading-6">
                {shownError}
              </p>
            ) : shownQuote ? (
              <dl className="mt-4 flex flex-col gap-2 text-sm">
                <Line
                  label="Slots"
                  value={chosenSlots.map((slot) => slot.label).join(", ")}
                />
                <Line
                  label="Duration"
                  value={`${durationDays} day${durationDays === 1 ? "" : "s"}`}
                />
                <div className="border-hairline my-1 border-t" />
                <Line label="Base" value={formatINR(shownQuote.basePaise)} />
                {shownQuote.discountPaise > 0 && (
                  <Line
                    label={`Group discount (${shownQuote.groupDiscountBp / 100}%)`}
                    value={`− ${formatINR(shownQuote.discountPaise)}`}
                  />
                )}
                {shownQuote.addonsPaise > 0 && (
                  <Line
                    label="Add-ons"
                    value={formatINR(shownQuote.addonsPaise)}
                  />
                )}
                {shownQuote.surgeApplied && (
                  <p className="text-terracotta text-xs leading-5">
                    Demand pricing applies — the wall is nearly full.
                  </p>
                )}
                <Line
                  label={`GST (${gstRatePct}%)`}
                  value={formatINR(shownQuote.gstPaise)}
                />
                <div className="border-hairline mt-2 border-t pt-3">
                  <Line
                    label="Total"
                    value={formatINR(shownQuote.totalPaise)}
                    emphasis
                  />
                </div>
                <p className="text-ink-muted mt-1 text-xs leading-5">
                  Inclusive of GST. Nothing is charged until you pay, and your
                  slots are held while you do.
                </p>
              </dl>
            ) : (
              <p className="text-ink-muted mt-4 text-sm" aria-live="polite">
                {pricing ? "Pricing…" : "…"}
              </p>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
}

function Line({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={emphasis ? "font-medium" : "text-ink-muted"}>{label}</dt>
      <dd
        className={`text-right tabular-nums ${emphasis ? "text-base font-medium" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The confirmation, and the shareable graphic (F29).
 *
 * A booking is a thing an artist wants to tell people about, so the card is
 * built to be screenshotted: the venue, the dates, the slot, and nothing
 * confidential. The fee is shown to the artist as running text but is
 * deliberately kept out of the dark card, because that is the part that gets
 * posted publicly.
 */
function BookingConfirmed({
  slots,
  durationDays,
  startDate,
  totalPaise,
  venueName,
  message,
}: {
  slots: string[];
  durationDays: number;
  startDate: string;
  totalPaise: number;
  venueName: string;
  message: string;
}) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="border-hairline overflow-hidden rounded-md border">
        <div className="bg-footer relative px-8 py-12 text-center text-white">
          <p className="text-eyebrow text-white/60">{venueName}</p>
          <p className="font-heading mt-4 text-3xl leading-tight text-balance">
            I&rsquo;m exhibiting on The Wall
          </p>
          <p className="mt-4 text-sm text-white/70">
            Slot{slots.length === 1 ? "" : "s"} {slots.join(", ")} ·{" "}
            {durationDays} day{durationDays === 1 ? "" : "s"} from {startDate}
          </p>
          <p className="mt-8 text-xs tracking-wider text-white/40 uppercase">
            artwalllabs.com
          </p>
        </div>

        <div className="p-6">
          <p className="text-signal flex items-center gap-2 text-sm font-medium">
            <Check className="size-4" aria-hidden />
            {message}
          </p>
          {totalPaise > 0 && (
            <p className="text-ink-muted mt-2 text-sm">
              {formatINR(totalPaise)} due, GST included.
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/physical-wall/bookings"
              className="bg-ember text-wall-paper hover:bg-ember-glow text-small inline-flex h-10 items-center rounded-md px-4 font-medium transition-colors"
            >
              Pay and pick an install slot
            </Link>
            <Link
              href="/physical-wall/book"
              className="border-hairline-strong hover:border-ink text-small inline-flex h-10 items-center rounded-md border px-4"
            >
              Book another
            </Link>
          </div>

          <p className="text-ink-muted mt-4 text-xs leading-5">
            Screenshot the card above to share it — it carries nothing private.
          </p>
        </div>
      </div>
    </div>
  );
}
