"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import type { PainStage } from "@/config/content";
import { cn } from "@/lib/utils";

/**
 * The twenty-four failures, one stage at a time.
 *
 * A disclosure list rather than six open columns: laid out flat this is a wall
 * of bad news, and nobody reads a wall of bad news. Opened one at a time it
 * reads as a diagnosis.
 *
 * Accessibility: real buttons with `aria-expanded` and `aria-controls`, and the
 * panel is a plain region rather than an ARIA accordion widget - there is no
 * keyboard convention being broken, so no extra key handling is needed.
 */
export function PainStages({ stages }: { stages: readonly PainStage[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <ul className="border-border border-t">
      {stages.map((stage, index) => {
        const expanded = open === index;
        const panelId = `pain-panel-${index}`;

        return (
          <li key={stage.stage} className="border-border border-b">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : index)}
              aria-expanded={expanded}
              aria-controls={panelId}
              className="group flex w-full items-center gap-5 py-6 text-left"
            >
              <span className="text-muted-foreground w-24 shrink-0 text-xs tracking-[0.14em] uppercase">
                {stage.stage}
              </span>
              <span className="font-heading text-subsection flex-1">
                {stage.problem}
              </span>
              <Plus
                aria-hidden
                className={cn(
                  "text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-transform duration-200",
                  expanded && "rotate-45"
                )}
              />
            </button>

            {expanded && (
              <div id={panelId} className="pb-8 sm:pl-29">
                <ul className="flex flex-col gap-3">
                  {stage.fixes.map((fix) => (
                    <li
                      key={fix}
                      className="text-muted-foreground flex gap-3 leading-7"
                    >
                      <span aria-hidden className="text-foreground shrink-0">
                       ,
                      </span>
                      {fix}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
