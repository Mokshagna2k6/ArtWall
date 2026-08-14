"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

interface Faq {
  question: string;
  answer: string;
}

/**
 * Frequently asked questions.
 *
 * A disclosure list. Real buttons with `aria-expanded` and `aria-controls`,
 * and the answer is a plain region rather than an ARIA accordion widget -
 * there is no keyboard convention at stake, so adding one would only give a
 * screen-reader user more to learn.
 */
export function Faqs({ items }: { items: readonly Faq[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <ul className="border-border border-t">
      {items.map((item, index) => {
        const expanded = open === index;
        const panelId = `faq-panel-${index}`;

        return (
          <li key={item.question} className="border-border border-b">
            <h3>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : index)}
                aria-expanded={expanded}
                aria-controls={panelId}
                className="group flex w-full items-center justify-between gap-6 py-6 text-left"
              >
                <span className="text-lead">{item.question}</span>
                <Plus
                  aria-hidden
                  className={cn(
                    "text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-transform duration-200",
                    expanded && "rotate-45"
                  )}
                />
              </button>
            </h3>
            {expanded && (
              <p
                id={panelId}
                className="text-muted-foreground max-w-2xl pb-7 leading-8"
              >
                {item.answer}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
