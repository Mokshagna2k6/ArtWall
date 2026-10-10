"use client";

import { useActionState, useState } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import { redeemPerk } from "@/features/physical-wall/actions/perk";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";

/**
 * The Ric Platter counter screen (RP01).
 *
 * Used by someone else's staff, at a till, with a customer waiting. So:
 *
 *  - the eligibility check has already run server-side before this renders, and
 *    its verdict is the first thing on screen,
 *  - there is exactly one field to fill in, and it is a number,
 *  - the discount is shown as an amount to subtract and as the figure to
 *    charge, because "10%" is a sum someone has to do and "₹1,080" is not.
 *
 * The bill total is the whole point of the integration. Without it the record
 * is a coupon log; with it, it is proof that art on the wall drives spend at
 * the till.
 */
export function PerkCounter({
  token,
  principalName,
  principalType,
  discountPct,
  eligible,
  reason,
}: {
  token: string;
  principalName: string;
  principalType: "artist" | "visitor";
  discountPct: number;
  eligible: boolean;
  reason?: string;
}) {
  const [state, formAction] = useActionState(redeemPerk, IDLE);
  const [bill, setBill] = useState("");

  const billNumber = Number(bill);
  const preview =
    Number.isFinite(billNumber) && billNumber > 0
      ? {
          discount: Math.round(billNumber * discountPct) / 100,
          pays: billNumber - Math.round(billNumber * discountPct) / 100,
        }
      : null;

  const done = state.status === "ok";

  return (
    <div className="border-hairline rounded-md border p-6">
      <p className="text-ink-muted text-label tracking-wider uppercase">
        {principalType === "artist" ? "Exhibiting artist" : "Registered visitor"}
      </p>
      <h1 className="font-heading text-section mt-2">{principalName}</h1>

      {!eligible ? (
        <p className="border-terracotta text-ink mt-5 rounded-md border border-dashed p-4 text-sm leading-6">
          {reason ?? "This code can't be used right now."}
        </p>
      ) : done ? (
        <div className="mt-5">
          <p className="text-signal text-lg leading-7 font-medium">
            {state.message}
          </p>
          <p className="text-ink-muted mt-3 text-sm leading-6">
            Recorded. You can close this screen.
          </p>
        </div>
      ) : (
        <form action={formAction} className="mt-6 flex flex-col gap-5">
          <input type="hidden" name="token" value={token} />

          <Field
            label="Bill total (₹)"
            htmlFor="billAmount"
            hint="The full amount before the discount."
          >
            <input
              id="billAmount"
              name="billAmount"
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              required
              autoFocus
              value={bill}
              onChange={(event) => setBill(event.target.value)}
              className={`${inputClass} h-14 text-2xl tabular-nums`}
            />
          </Field>

          {preview && (
            <dl
              className="bg-band flex flex-col gap-2 rounded-md p-4 text-sm"
              aria-live="polite"
            >
              <div className="flex justify-between">
                <dt className="text-ink-muted">
                  Discount ({discountPct}%)
                </dt>
                <dd className="tabular-nums">
                  − ₹{preview.discount.toLocaleString("en-IN")}
                </dd>
              </div>
              <div className="border-hairline flex justify-between border-t pt-2 text-base font-medium">
                <dt>Customer pays</dt>
                <dd className="tabular-nums">
                  ₹{preview.pays.toLocaleString("en-IN")}
                </dd>
              </div>
            </dl>
          )}

          <SubmitButton>Apply discount and record</SubmitButton>
          <FormStatus state={state} />
        </form>
      )}
    </div>
  );
}
