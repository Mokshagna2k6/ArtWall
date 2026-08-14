"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { submitSurvey } from "@/features/survey/actions";
import {
  commissionBands,
  incomeBands,
  painPoints,
  surveyRoles,
  type SurveyInput,
  type SurveyState,
} from "@/features/survey/schema";
import { practices } from "@/features/waitlist/schema";
import { cn } from "@/lib/utils";

const initialState: SurveyState = { status: "idle" };

function fieldError(state: SurveyState, field: keyof SurveyInput) {
  return state.status === "error" ? state.fieldErrors?.[field] : undefined;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-foreground inline-flex h-12 items-center justify-center gap-2 px-6 text-sm font-medium text-white transition-colors hover:bg-[#2b3245] disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {pending ? "Sending…" : "Send my answers"}
    </button>
  );
}

/**
 * The pain-point survey.
 *
 * Ten checkboxes and four optional questions. Everything is optional except
 * picking at least one pain point, because a survey that demands an email
 * before it will listen is not listening.
 *
 * Architecture: `useActionState` posts to a Server Action, so it works before
 * hydration - a real progressive-enhancement win on the mid-range Android
 * phones most of this audience is holding.
 *
 * Accessibility: every control has a real label, the checkbox group is a
 * `fieldset` with a `legend`, errors are tied to their field with
 * `aria-describedby`, and the result is announced through a polite live region
 * rather than only being recoloured.
 */
export function SurveyForm() {
  const [state, formAction] = useActionState(submitSurvey, initialState);

  if (state.status === "success") {
    return (
      <div
        role="status"
        className="border-border border-t py-12 text-center sm:py-16"
      >
        <p className="font-heading text-section text-balance">
          Thank you. That is genuinely useful.
        </p>
        <p className="text-muted-foreground mx-auto mt-5 max-w-md leading-7">
          Your answers go straight into how we order what gets built next.
          Nothing here is sold, shared, or used to market at you.
        </p>
        <a
          href="/join"
          className="bg-foreground mt-8 inline-flex h-11 items-center px-5 text-sm font-medium text-white transition-colors hover:bg-[#2b3245]"
        >
          Take your place on the wall
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-12">
      {/* Honeypot: off-screen, unfocusable, never announced. */}
      <div aria-hidden className="sr-only">
        <label htmlFor="survey-website">Website</label>
        <input
          id="survey-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <fieldset>
        <legend className="text-muted-foreground text-eyebrow">You are</legend>
        <div className="mt-4 flex flex-wrap gap-2">
          {surveyRoles.map((role, index) => (
            <label
              key={role}
              className="border-border has-checked:border-foreground has-checked:bg-foreground cursor-pointer border px-4 py-2.5 text-sm capitalize transition-colors has-checked:text-white"
            >
              <input
                type="radio"
                name="role"
                value={role}
                defaultChecked={index === 0}
                className="sr-only"
              />
              {role === "other" ? "Someone else" : role}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-muted-foreground text-eyebrow">
          Which of these have you lived through?
        </legend>
        <p className="text-muted-foreground mt-3 text-sm">
          Choose as many as apply. This is the only required question.
        </p>
        <ul className="border-border mt-5 border-t">
          {painPoints.map((point) => (
            <li key={point} className="border-border border-b">
              <label className="group flex cursor-pointer items-start gap-4 py-4">
                <input
                  type="checkbox"
                  name="painPoints"
                  value={point}
                  className="border-input accent-foreground mt-1 size-4 shrink-0"
                />
                <span className="leading-7">{point}</span>
              </label>
            </li>
          ))}
        </ul>
        {fieldError(state, "painPoints") && (
          <p className="text-destructive mt-3 text-sm">
            {fieldError(state, "painPoints")}
          </p>
        )}
      </fieldset>

      {/* Bottom-aligned: one of these labels wraps to two lines on a narrow
          desktop, and top-aligned controls would step down with it. */}
      <div className="grid items-end gap-8 sm:grid-cols-2">
        <Select
          id="fairCommission"
          name="fairCommission"
          label="What commission would feel fair?"
          options={commissionBands}
        />
        <Select
          id="earnsFromArt"
          name="earnsFromArt"
          label="How much of your income comes from your art?"
          options={incomeBands}
        />
        <Select
          id="practice"
          name="practice"
          label="What you make"
          options={practices}
        />
        <Text
          id="city"
          name="city"
          label="City"
          autoComplete="address-level2"
        />
      </div>

      <div className="flex flex-col gap-3">
        <label
          htmlFor="biggestProblem"
          className="text-muted-foreground text-eyebrow"
        >
          If we could fix one thing first, what should it be?
        </label>
        <textarea
          id="biggestProblem"
          name="biggestProblem"
          rows={3}
          maxLength={400}
          className="border-input focus:border-foreground border bg-white p-3 leading-7 transition-colors outline-none"
        />
      </div>

      <div className="flex flex-col gap-3">
        <label
          htmlFor="survey-email"
          className="text-muted-foreground text-eyebrow"
        >
          Email, only if you want us to write back
        </label>
        <input
          id="survey-email"
          name="email"
          type="email"
          autoComplete="email"
          aria-invalid={fieldError(state, "email") ? true : undefined}
          aria-describedby={
            fieldError(state, "email") ? "survey-email-error" : undefined
          }
          className={cn(
            "border-input focus:border-foreground h-11 border bg-white px-3 transition-colors outline-none",
            fieldError(state, "email") && "border-destructive"
          )}
        />
        {fieldError(state, "email") && (
          <p id="survey-email-error" className="text-destructive text-sm">
            {fieldError(state, "email")}
          </p>
        )}
      </div>

      <div className="border-border flex flex-col gap-5 border-t pt-8">
        <SubmitButton />
        <div aria-live="polite" role="status" className="min-h-5">
          {state.status === "error" && (
            <p className="text-destructive text-sm">{state.message}</p>
          )}
        </div>
        <p className="text-muted-foreground text-xs leading-6">
          Answers are stored to shape the roadmap. They are never sold, and an
          email address is only used to write back to you.
        </p>
      </div>
    </form>
  );
}

function Select({
  id,
  name,
  label,
  options,
}: {
  id: string;
  name: string;
  label: string;
  options: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-muted-foreground text-eyebrow">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue=""
        className="border-input focus:border-foreground h-11 border bg-white px-3 transition-colors outline-none"
      >
        <option value="">Prefer not to say</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function Text({
  id,
  name,
  label,
  autoComplete,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-muted-foreground text-eyebrow">
        {label}
      </label>
      <input
        id={id}
        name={name}
        autoComplete={autoComplete}
        className="border-input focus:border-foreground h-11 border bg-white px-3 transition-colors outline-none"
      />
    </div>
  );
}
