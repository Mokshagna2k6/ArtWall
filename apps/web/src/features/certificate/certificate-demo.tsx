"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, RotateCcw } from "lucide-react";

import { transition } from "@/lib/motion";
import { cn } from "@/lib/utils";

const steps = [
  {
    title: "You photograph the work",
    body: "In your studio, the day you finish it. That photograph, its exact pixels, and the date become the record.",
    aside: "Nothing is uploaded in this demonstration.",
  },
  {
    title: "We take its fingerprint",
    body: "A photograph can be copied; its fingerprint cannot be forged. We compute one from the image itself, change a single pixel and it no longer matches.",
    aside: "Technically a cryptographic hash. You never have to know that.",
  },
  {
    title: "The seal is pressed",
    body: "The fingerprint is written somewhere it cannot be edited, deleted, or quietly revised later, not by a buyer, not by a gallery, not by us.",
    aside:
      "This is the only part that touches a blockchain. No wallet, no crypto, no fees for you.",
  },
  {
    title: "The work carries proof",
    body: "It gets a readable certificate number and a printable seal you can attach to the physical frame. Anyone can check it in seconds.",
    aside: "WALL-2026-DIWALI-0417, an edition number, not a wallet address.",
  },
] as const;

/**
 * Certification, demonstrated rather than described.
 *
 * The problem this solves: "blockchain certification" is the single most
 * trust-destroying phrase we could put in front of an artist who has never
 * touched crypto - it reads as either jargon or a scam. So the word appears
 * exactly once, late, and only to say what it does *not* require of them.
 *
 * The sequence is manual, not auto-playing: someone deciding whether to trust
 * you with their livelihood should set their own pace through the explanation.
 *
 * Accessibility: the steps are a real ordered list; the stepper buttons expose
 * their selected state, and the panel is a live region so advancing announces
 * the new step rather than silently swapping text.
 */
export function CertificateDemo() {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const complete = step === steps.length - 1;

  return (
    <div className="flex flex-col gap-8">
      {/* Stepper */}
      <ol className="flex flex-wrap gap-2">
        {steps.map((item, index) => {
          const done = index < step;
          const active = index === step;
          return (
            <li key={item.title}>
              <button
                type="button"
                onClick={() => setStep(index)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "text-small flex h-9 items-center gap-2 rounded-md border px-3 transition-colors",
                  active && "border-ember bg-ember/10 text-foreground",
                  done && "border-ember/40 text-muted-foreground",
                  !active &&
                    !done &&
                    "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "text-caption flex size-4 items-center justify-center rounded-full tabular-nums",
                    done ? "bg-ember text-white" : "border-border border"
                  )}
                >
                  {done ? (
                    <Check className="size-2.5" aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="hidden sm:inline">Step {index + 1}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div
        aria-live="polite"
        className="border-border bg-wall-charcoal/50 min-h-64 rounded-xl border p-6 sm:p-8"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={transition.base}
            className="flex flex-col gap-4"
          >
            <p className="text-ember text-label tracking-[0.18em] uppercase">
              Step {step + 1} of {steps.length}
            </p>
            <h2 className="font-heading text-subsection">{current.title}</h2>
            <p className="text-muted-foreground text-body-lg max-w-2xl">
              {current.body}
            </p>
            <p className="border-border text-muted-foreground text-small mt-2 border-l-2 pl-4">
              {current.aside}
            </p>

            {complete && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={transition.slow}
                className="border-ember/40 bg-ember/5 mt-4 flex items-center gap-4 rounded-lg border p-5"
              >
                <span
                  aria-hidden
                  className="bg-ember flex size-10 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ boxShadow: "0 0 24px var(--color-ember)" }}
                >
                  <Check className="size-5" />
                </span>
                <div>
                  <p className="text-body font-medium">Certified</p>
                  <p className="text-muted-foreground text-small">
                    This work is provably yours, and stays that way.
                  </p>
                </div>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex gap-3">
        {!complete ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(s + 1, steps.length - 1))}
            className="bg-ember hover:bg-ember-glow text-body inline-flex h-11 items-center rounded-md px-5 font-medium text-white transition-colors"
          >
            Next step
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep(0)}
            className="border-border text-muted-foreground hover:text-foreground text-body inline-flex h-11 items-center gap-2 rounded-md border px-5 transition-colors"
          >
            <RotateCcw className="size-4" aria-hidden />
            Watch again
          </button>
        )}
      </div>
    </div>
  );
}
