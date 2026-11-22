import Link from "next/link";
import { Check } from "lucide-react";

import type { Checklist } from "@/features/studio/checklist";

/** "Getting started", N/7 — every tick comes from real state (§8.2). */
export function StudioChecklistPanel({ checklist }: { checklist: Checklist }) {
  const { steps, completed, total, percent } = checklist;
  const done = completed === total;

  return (
    <section className="studio-card p-6 md:p-8" aria-label="Getting started">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="studio-eyebrow">Getting started</p>
          <h2 className="text-studio-ink text-subsection mt-2">
            {done ? "Your studio is set up" : "Finish setting up your studio"}
          </h2>
        </div>
        <p className="text-studio-muted text-sm">
          <span className="text-studio-ink font-heading text-card">
            {completed}/{total}
          </span>{" "}
          complete
        </p>
      </div>

      <div
        className="bg-studio-bg mt-5 h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${completed} of ${total} setup steps complete`}
      >
        <div
          className="bg-studio-accent h-full rounded-full transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="mt-6 flex flex-col gap-1">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className="hover:bg-studio-bg flex items-start gap-3 rounded px-2 py-3 transition-colors"
            >
              <span
                aria-hidden
                className={
                  step.done
                    ? "border-studio-accent bg-studio-accent text-studio-surface mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border"
                    : "border-studio-border mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border"
                }
              >
                {step.done && <Check className="size-3" />}
              </span>
              <span className="min-w-0">
                <span
                  className={
                    step.done
                      ? "text-studio-muted block text-sm line-through"
                      : "text-studio-ink block text-sm font-medium"
                  }
                >
                  {step.label}
                </span>
                <span className="text-studio-muted block text-xs">{step.description}</span>
              </span>
              <span className="sr-only">{step.done ? "Complete" : "Not complete"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
