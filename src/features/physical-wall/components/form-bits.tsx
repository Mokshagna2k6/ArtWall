"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import type { ActionState } from "@/features/physical-wall/action-state";

/**
 * The small pieces every physical-wall form needs.
 *
 * Extracted because there are a dozen forms in this feature and they all need
 * the same three things: a submit button that knows it is pending, a live region
 * that announces the result, and a labelled field. Repeating the markup twelve
 * times is how the twelfth one ends up missing its `aria-live`.
 */

export function SubmitButton({
  children,
  variant = "primary",
  name,
  value,
  disabled,
}: {
  children: ReactNode;
  variant?: "primary" | "quiet" | "danger";
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  const styles = {
    primary:
      "bg-ember text-wall-paper hover:bg-ember-glow border-transparent",
    quiet:
      "border-hairline-strong text-ink hover:border-ink bg-transparent",
    danger:
      "border-destructive/40 text-destructive hover:bg-destructive/5 bg-transparent",
  }[variant];

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      className={`text-small inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${styles}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

/**
 * The result of the last submission.
 *
 * `role="status"` with `aria-live="polite"` so a screen-reader user hears the
 * outcome without it interrupting them mid-sentence. `min-h-5` reserves the
 * space so the form does not jump when a message appears.
 */
export function FormStatus({ state }: { state: ActionState }) {
  return (
    <p aria-live="polite" role="status" className="text-small min-h-5">
      {state.status === "error" && (
        <span className="text-destructive">{state.message}</span>
      )}
      {state.status === "ok" && <span className="text-signal">{state.message}</span>}
    </p>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-label text-ink-muted tracking-wider uppercase"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-ink-muted text-xs leading-5">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "border-hairline-strong bg-wall-paper text-body h-10 w-full rounded-md border px-3 focus:border-ink focus:outline-none";

/**
 * Two-step destructive action (FE-2.12): the first click only arms it and
 * shows what will happen; `children` (the real submit/button) plus "Keep it"
 * appear in its place. Focus lands on "Keep it" (the safe choice) and returns
 * to the trigger if the admin backs out.
 */
export function ConfirmStep({
  label,
  warning,
  children,
  disabled,
}: {
  label: string;
  warning: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) return;
    (armed ? keep : trigger).current?.focus();
  }, [armed]);
  const toggle = (next: boolean) => {
    touched.current = true;
    setArmed(next);
  };

  if (!armed) {
    return (
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        onClick={() => toggle(true)}
        className="border-destructive/40 text-destructive hover:bg-destructive/5 text-small inline-flex h-10 items-center rounded-md border px-4 font-medium disabled:cursor-not-allowed disabled:opacity-60"
      >
        {label}
      </button>
    );
  }
  return (
    <div role="group" aria-label={`Confirm ${label.toLowerCase()}`} className="flex flex-col gap-2">
      <p className="text-destructive max-w-sm text-xs leading-5">{warning}</p>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <button
          ref={keep}
          type="button"
          onClick={() => toggle(false)}
          className="text-ink-muted hover:text-ink text-small underline underline-offset-4"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
