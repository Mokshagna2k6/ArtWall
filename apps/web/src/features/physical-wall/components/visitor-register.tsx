"use client";

import { useActionState, useState } from "react";

import { registerVisitor } from "@/features/physical-wall/actions/visitor";
import { IDLE } from "@/features/physical-wall/action-state";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";

/**
 * Walk-in registration (F26).
 *
 * The consent design is the point of this form, not a detail of it:
 *
 *  - The purpose checkbox is **required** and says in plain words what the data
 *    is for and how long it is kept. Without it the server refuses the row —
 *    the schema types it as literal `true`, so this is not a client-side nicety.
 *  - The marketing checkbox is **separate, optional, and unticked**. Bundling
 *    them, or pre-ticking either, is the dark pattern the spec explicitly rules
 *    out and the DPDP Act treats as invalid consent.
 *  - Only two fields are collected. Anything more would be data we cannot
 *    justify keeping.
 */
export function VisitorRegisterForm({ qrBase }: { qrBase: string }) {
  const [state, formAction] = useActionState(registerVisitor, IDLE);
  const [contactKind, setContactKind] = useState<"phone" | "email">("phone");

  const issued =
    state.status === "ok" && state.data && typeof state.data === "object"
      ? (state.data as { token?: string }).token
      : undefined;

  if (issued) {
    return (
      <div className="border-hairline rounded-md border p-6 text-center">
        <p className="text-signal text-eyebrow">You&rsquo;re in</p>
        <h2 className="font-heading text-section mt-3">
          Show this at the counter
        </h2>
        <p className="text-ink-muted mx-auto mt-3 max-w-sm text-sm leading-6">
          Ric Platter staff will scan it when you pay and take 10% off your
          bill. It works once, today.
        </p>
        <div className="mt-6 flex justify-center">
          {/* Rendered as a link rather than an image because the QR itself is
              drawn server-side; this keeps the token out of the client bundle
              until the visitor's own page requests it. */}
          <a
            href={`${qrBase}/q/${issued}`}
            className="border-hairline-strong text-small hover:border-ink inline-flex h-11 items-center rounded-md border px-5"
          >
            Open my code
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field label="Your name" htmlFor="name">
        <input
          id="name"
          name="name"
          required
          maxLength={80}
          autoComplete="name"
          className={inputClass}
        />
      </Field>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-label text-ink-muted mb-1.5 tracking-wider uppercase">
          How should we reach you
        </legend>
        <div className="flex gap-2">
          {(["phone", "email"] as const).map((kind) => (
            <label
              key={kind}
              className={`text-small flex h-10 flex-1 cursor-pointer items-center justify-center rounded-md border capitalize ${
                contactKind === kind
                  ? "border-ink bg-ink text-wall-paper"
                  : "border-hairline-strong"
              }`}
            >
              <input
                type="radio"
                name="contactKind"
                value={kind}
                checked={contactKind === kind}
                onChange={() => setContactKind(kind)}
                className="sr-only"
              />
              {kind}
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label={contactKind === "phone" ? "Mobile number" : "Email address"}
        htmlFor="contact"
      >
        <input
          id="contact"
          name="contact"
          required
          inputMode={contactKind === "phone" ? "numeric" : "email"}
          autoComplete={contactKind === "phone" ? "tel" : "email"}
          className={inputClass}
        />
      </Field>

      <div className="border-hairline flex flex-col gap-4 rounded-md border p-4">
        <label className="flex cursor-pointer gap-3 text-sm leading-6">
          <input
            type="checkbox"
            name="consentPurpose"
            required
            className="mt-1 size-4 shrink-0"
          />
          <span>
            I agree that ArtWall can store my name and{" "}
            {contactKind === "phone" ? "number" : "email"} to send me a summary
            of my visit and to run the Ric Platter coupon.{" "}
            <span className="text-ink-muted">
              Kept for 90 days, then deleted. You can delete it sooner at any
              time.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer gap-3 text-sm leading-6">
          <input
            type="checkbox"
            name="consentMarketing"
            className="mt-1 size-4 shrink-0"
          />
          <span>
            Optional: also send me invitations to future shows.{" "}
            <span className="text-ink-muted">
              Say no and everything above still works.
            </span>
          </span>
        </label>
      </div>

      <SubmitButton>Register and get my code</SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}
