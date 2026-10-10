"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";

import { IDLE } from "@/features/physical-wall/action-state";
import { completeOnboarding } from "@/features/physical-wall/actions/account";
import {
  FormStatus,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import { OPTIONAL_PURPOSES, purposeNotice } from "@/features/physical-wall/consent";

/**
 * Finishing registration (F31, DPDP §5.2 and §5.4).
 *
 * Every consent decision the artist makes is on this one screen, and each is a
 * separate control with its own plain-language notice attached — what data,
 * why, how long, and what happens if it is withdrawn. Nothing optional is
 * pre-ticked, and nothing required is bundled with something that isn't.
 *
 * The age question is here rather than on the sign-up form because it is not a
 * credential: it decides whether we may lawfully process at all. Answering "no"
 * is not a dead end — it routes to the parental-consent path, because a
 * seventeen-year-old painter is a real artist and the Act asks for a guardian,
 * not a refusal.
 */
export function OnboardingForm({ name }: { name: string }) {
  const [state, formAction] = useActionState(completeOnboarding, IDLE);
  const [isAdult, setIsAdult] = useState<boolean | null>(null);

  const account = purposeNotice("account");

  if (isAdult === false) {
    return (
      <div className="border-hairline rounded-md border p-6">
        <h2 className="font-heading text-card">
          We need a parent or guardian for this.
        </h2>
        <p className="text-ink-muted mt-3 text-sm leading-6">
          Indian data-protection law treats anyone under 18 as a child, and asks
          us to get verifiable consent from a parent or guardian before we
          process their information. That is a real step, not a formality, so we
          do it by hand rather than with a checkbox.
        </p>
        <p className="text-ink-muted mt-3 text-sm leading-6">
          Email{" "}
          <a
            href="mailto:artwalllabs@gmail.com?subject=Guardian%20consent%20for%20a%20young%20artist"
            className="text-ink underline underline-offset-4"
          >
            artwalllabs@gmail.com
          </a>{" "}
          with your guardian copied in and we&rsquo;ll set your account up
          together. Your work is welcome here.
        </p>
        <button
          type="button"
          onClick={() => setIsAdult(null)}
          className="text-ink-muted hover:text-ink text-small mt-5 underline underline-offset-4"
        >
          I got that wrong — go back
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <section>
        <h2 className="font-heading text-section">First, your age</h2>
        <p className="text-ink-muted mt-2 text-sm leading-6">
          We have to ask before we store anything else.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsAdult(true)}
            aria-pressed={isAdult === true}
            className={`text-small inline-flex h-11 items-center rounded-md border px-5 transition-colors ${
              isAdult === true
                ? "border-ink bg-ink text-wall-paper"
                : "border-hairline-strong hover:border-ink"
            }`}
          >
            I&rsquo;m 18 or over
          </button>
          <button
            type="button"
            onClick={() => setIsAdult(false)}
            className="border-hairline-strong hover:border-ink text-small inline-flex h-11 items-center rounded-md border px-5"
          >
            I&rsquo;m under 18
          </button>
        </div>
        {isAdult === true && (
          <input type="hidden" name="isAdult" value="on" />
        )}
      </section>

      {isAdult === true && (
        <>
          <section>
            <h2 className="font-heading text-section">What we need</h2>
            <div className="border-hairline mt-4 rounded-md border p-4">
              <label className="flex cursor-pointer gap-3 text-sm leading-6">
                <input
                  type="checkbox"
                  name="account"
                  required
                  className="mt-1 size-4 shrink-0"
                />
                <span>
                  <span className="font-medium">{account.label}</span>
                  <span className="text-ink-muted mt-1 block">
                    {account.what}
                  </span>
                  <span className="text-ink-muted mt-1 block text-xs">
                    Kept: {account.retention}
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section>
            <h2 className="font-heading text-section">What&rsquo;s up to you</h2>
            <p className="text-ink-muted mt-2 text-sm leading-6">
              All optional, all separate, all reversible from your account page.
              Saying no to every one of these changes nothing about your ability
              to exhibit.
            </p>

            <div className="mt-4 flex flex-col gap-3">
              {OPTIONAL_PURPOSES.filter(
                (purpose) => purpose.purpose !== "ugc_publication"
              ).map((purpose) => (
                <div
                  key={purpose.purpose}
                  className="border-hairline rounded-md border p-4"
                >
                  <label className="flex cursor-pointer gap-3 text-sm leading-6">
                    <input
                      type="checkbox"
                      name={purpose.purpose}
                      className="mt-1 size-4 shrink-0"
                    />
                    <span>
                      <span className="font-medium">{purpose.label}</span>
                      <span className="text-ink-muted mt-1 block">
                        {purpose.what}
                      </span>
                      <span className="text-ink-muted mt-1 block text-xs">
                        If you withdraw: {purpose.onWithdraw}
                      </span>
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-heading text-section">Founding member</h2>
            <div className="border-hairline mt-4 rounded-md border p-4">
              <label className="flex cursor-pointer gap-3 text-sm leading-6">
                <input
                  type="checkbox"
                  name="foundingMember"
                  className="mt-1 size-4 shrink-0"
                />
                <span>
                  <span className="font-medium">
                    Count me as a founding member.
                  </span>
                  <span className="text-ink-muted mt-1 block">
                    Founding members get priority in the waitlist when the wall
                    is full. It costs nothing and asks nothing — it&rsquo;s a
                    claim you make, not a status we assign.
                  </span>
                </span>
              </label>
            </div>
          </section>

          <div className="flex flex-col gap-3">
            <div>
              <SubmitButton>Finish and see the wall</SubmitButton>
            </div>
            <FormStatus state={state} />
            <ul className="text-ink-muted flex flex-col gap-1.5 text-xs">
              {[
                `Welcome, ${name}. This is the last form before the wall.`,
                "Change any of it later from your account page.",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check className="text-ink mt-0.5 size-3 shrink-0" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </form>
  );
}
