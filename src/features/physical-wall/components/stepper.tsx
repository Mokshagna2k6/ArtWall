"use client";

import { Check } from "lucide-react";

/**
 * The progress rail for a multi-step flow.
 *
 * Steps are shown, not hidden: an artist about to spend a few thousand rupees
 * should be able to see how much is left before they commit, and which stage
 * they can go back to. Completed steps are clickable so a price can be
 * re-checked without abandoning the flow.
 *
 * On a phone the labels drop away and the dots remain — five words of nav on a
 * 375px screen wraps into three lines and pushes the actual form below the fold.
 */
export function Stepper({
  steps,
  current,
  furthest,
  onJump,
}: {
  steps: readonly string[];
  /** 1-based. */
  current: number;
  /** The highest step reached, so completed ones can be revisited. */
  furthest: number;
  onJump: (step: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {steps.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        const reachable = step <= furthest;

        return (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => reachable && onJump(step)}
              disabled={!reachable}
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm transition-colors ${
                reachable ? "hover:bg-band" : "cursor-default"
              }`}
            >
              <span
                aria-hidden
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  done
                    ? "bg-signal text-wall-paper"
                    : active
                      ? "bg-ink text-wall-paper"
                      : "bg-band text-ink-muted"
                }`}
              >
                {done ? <Check className="size-3" /> : step}
              </span>
              <span
                className={`hidden whitespace-nowrap sm:inline ${
                  active ? "text-ink font-medium" : "text-ink-muted"
                }`}
              >
                {label}
              </span>
              <span className="sr-only">
                {label}
                {done ? " (done)" : active ? " (current step)" : ""}
              </span>
            </button>
            {index < steps.length - 1 && (
              <span aria-hidden className="bg-hairline-strong h-px w-4" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
