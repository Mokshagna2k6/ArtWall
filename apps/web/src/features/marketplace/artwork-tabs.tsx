"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The artwork page's bottom tabs: Details · COA Plus · History (§8.7).
 *
 * Every panel's content is rendered into the HTML and the inactive ones are
 * hidden with `hidden`, not unmounted. That is deliberate: this page is public
 * and indexable (Phase 1 §1 depends on it for SEO), so the provenance and
 * certificate text must be in the served markup, not behind a click. It also
 * means the content is reachable with JavaScript off.
 */
export function ArtworkTabs({
  details,
  coaPlus,
  history,
}: {
  details: ReactNode;
  coaPlus: ReactNode;
  history: ReactNode;
}) {
  const panels = [
    { id: "details", label: "Details", content: details },
    { id: "coa", label: "COA Plus", content: coaPlus },
    { id: "history", label: "History", content: history },
  ];
  const [active, setActive] = useState("details");

  return (
    <section className="mt-14">
      <div className="border-hairline flex gap-1 border-b" role="tablist" aria-label="Artwork information">
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            role="tab"
            id={`tab-${panel.id}`}
            aria-selected={active === panel.id}
            aria-controls={`panel-${panel.id}`}
            onClick={() => setActive(panel.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-3 text-sm transition-colors",
              active === panel.id
                ? "border-ink text-ink font-semibold"
                : "text-ink-muted hover:text-ink border-transparent"
            )}
          >
            {panel.label}
          </button>
        ))}
      </div>
      {panels.map((panel) => (
        <div
          key={panel.id}
          role="tabpanel"
          id={`panel-${panel.id}`}
          aria-labelledby={`tab-${panel.id}`}
          hidden={active !== panel.id}
          className="pt-7"
        >
          {panel.content}
        </div>
      ))}
    </section>
  );
}
