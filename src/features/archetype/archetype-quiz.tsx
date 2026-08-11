"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  archetypes,
  type Archetype,
  type ArchetypeId,
} from "@/features/archetype/archetypes";
import { questions, type Choice } from "@/features/archetype/questions";
import { duration, transition } from "@/lib/motion";

/** Tally the answers; ties break toward the earliest answer given. */
function resolve(answers: ArchetypeId[]): ArchetypeId {
  const tally = new Map<ArchetypeId, number>();
  for (const answer of answers) {
    tally.set(answer, (tally.get(answer) ?? 0) + 1);
  }

  let best = answers[0];
  let bestCount = 0;
  for (const answer of answers) {
    const count = tally.get(answer) ?? 0;
    if (count > bestCount) {
      best = answer;
      bestCount = count;
    }
  }
  return best;
}

function Result({
  result,
  onRestart,
}: {
  result: Archetype;
  onRestart: () => void;
}) {
  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.09 } },
      }}
      role="status"
      aria-live="polite"
      aria-labelledby="archetype-result-title"
      className="border-border bg-wall-charcoal/18 overflow-hidden rounded-xl border"
    >
      <div className="relative p-6 sm:p-10 lg:p-12">
        <motion.div
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
          transition={transition.slow}
          aria-hidden
          className="bg-ember/15 pointer-events-none absolute top-0 left-0 h-px w-full"
        />

        <motion.p
          variants={{
            hidden: { opacity: 0, y: 8 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={transition.moderate}
          className="text-ember text-label tracking-[0.18em] uppercase"
        >
          Your Artist Archetype
        </motion.p>
        <motion.h2
          id="archetype-result-title"
          tabIndex={-1}
          variants={{
            hidden: { opacity: 0, y: 14 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={transition.slow}
          className="font-heading text-h2 sm:text-h1 lg:text-display-s mt-4 tracking-tight"
        >
          {result.name}
        </motion.h2>
        <motion.p
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={transition.slow}
          className="font-heading text-h4 mt-5 max-w-3xl text-balance"
        >
          {result.line}
        </motion.p>
        <motion.p
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={transition.slow}
          className="text-muted-foreground text-body-lg mt-5 max-w-2xl"
        >
          {result.body}
        </motion.p>
      </div>

      <div className="border-border border-t px-6 py-8 sm:px-10 lg:px-12">
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={transition.moderate}
          className="border-ember/30 border-l pl-5"
        >
          <p className="text-ember text-label tracking-[0.16em] uppercase">
            Your visual instinct
          </p>
          <p className="font-heading text-h4 mt-3 max-w-2xl text-balance">
            {result.visualInstinct}
          </p>
        </motion.div>

        <motion.ul
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
          transition={transition.moderate}
          aria-label="Visual traits"
          className="mt-8 flex flex-wrap gap-x-5 gap-y-3"
        >
          {result.traits.map((trait) => (
            <li
              key={trait}
              className="text-small text-muted-foreground before:text-ember before:mr-2 before:content-['/']"
            >
              {trait}
            </li>
          ))}
        </motion.ul>
      </div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          visible: { opacity: 1, y: 0 },
        }}
        transition={transition.slow}
        className="border-border border-t px-6 py-8 sm:px-10 lg:px-12"
      >
        <p className="text-label tracking-[0.16em] uppercase">Visual DNA</p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          {result.visualDna.map((item) => (
            <div key={item.label} className="border-border border-t pt-3">
              <dt className="text-muted-foreground text-caption tracking-[0.12em] uppercase">
                {item.label}
              </dt>
              <dd className="text-body mt-1">{item.value}</dd>
            </div>
          ))}
        </dl>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          visible: { opacity: 1, y: 0 },
        }}
        transition={transition.slow}
        className="border-border border-t px-6 py-8 sm:px-10 lg:px-12"
      >
        <p className="text-label tracking-[0.16em] uppercase">
          Artists your eye may understand
        </p>
        <p className="text-muted-foreground text-small mt-2">
          A few works to begin with, then follow the thread that feels yours.
        </p>
        <ul className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-3">
          {result.artworks.map((item) => (
            <li
              key={`${item.artist}-${item.artwork}`}
              className="border-border border-t pt-3"
            >
              <p className="text-body font-medium">{item.artist}</p>
              <p className="text-small mt-1">{item.artwork}</p>
              <p className="text-muted-foreground text-small mt-1">
                {item.note}
              </p>
            </li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          visible: { opacity: 1, y: 0 },
        }}
        transition={transition.slow}
        className="border-border border-t px-6 py-8 sm:px-10 lg:px-12"
      >
        <p className="text-muted-foreground text-caption tracking-[0.14em] uppercase">
          Notice <span className="text-ember px-1">→</span> Discover
          <span className="text-ember px-1">→</span> Artist
          <span className="text-ember px-1">→</span> Artwork
          <span className="text-ember px-1">→</span> Wall
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/wall"
            className="bg-ember text-wall-paper hover:bg-ember-glow text-body inline-flex h-12 items-center gap-2 rounded-md px-6 font-medium transition-[background-color,transform] duration-200 hover:-translate-y-px active:translate-y-0"
          >
            Find Your Wall
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={onRestart}
            className="border-border text-muted-foreground hover:text-foreground hover:border-ink/30 text-body inline-flex h-12 items-center gap-2 rounded-md border px-5 transition-[border-color,color,transform] duration-200 hover:-translate-y-px active:translate-y-0"
          >
            <RotateCcw className="size-4" aria-hidden />
            Begin again
          </button>
        </div>
      </motion.div>
    </motion.section>
  );
}

function ReadingTheRoom() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={transition.moderate}
      role="status"
      aria-live="polite"
      className="border-border bg-wall-charcoal/18 flex min-h-64 flex-col justify-end rounded-xl border p-8 sm:p-12"
    >
      <motion.div
        animate={{ scaleX: [0.2, 0.8, 1] }}
        transition={{ duration: duration.slow, ease: "easeOut" }}
        className="bg-ember h-px w-20 origin-left"
      />
      <p className="text-ember text-label mt-6 tracking-[0.18em] uppercase">
        One last look
      </p>
      <p className="font-heading text-h3 mt-3 max-w-xl text-balance">
        Gathering the details your eye returned to.
      </p>
    </motion.div>
  );
}

/**
 * The Artist Archetype. One question is visible at a time so the visitor can
 * respond to an image in their mind, not a dense form. The client boundary is
 * intentionally limited to this stateful interaction; its page stays server
 * rendered and fast.
 */
export function ArchetypeQuiz() {
  const [answers, setAnswers] = useState<ArchetypeId[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);

  const step = answers.length;
  const finished = step >= questions.length;
  const result = finished ? archetypes[resolve(answers)] : null;

  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  useEffect(() => {
    if (step > 0 && !finished && !isAdvancing) {
      questionHeadingRef.current?.focus();
    }
  }, [finished, isAdvancing, step]);

  function choose(choice: Choice) {
    if (isAdvancing) return;

    setSelectedChoice(choice.text);
    setIsAdvancing(true);
    const isFinalAnswer = step === questions.length - 1;

    advanceTimer.current = setTimeout(() => {
      if (isFinalAnswer) setIsRevealing(true);
      setAnswers((previous) => [...previous, choice.archetype]);
      setSelectedChoice(null);
      setIsAdvancing(false);
    }, 360);
  }

  function restart() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setAnswers([]);
    setSelectedChoice(null);
    setIsAdvancing(false);
    setIsRevealing(false);
  }

  useEffect(() => {
    if (!isRevealing) return;

    advanceTimer.current = setTimeout(() => setIsRevealing(false), 740);
  }, [isRevealing]);

  if (isRevealing) {
    return <ReadingTheRoom />;
  }

  if (result) {
    return <Result result={result} onRestart={restart} />;
  }

  const question = questions[step];
  const progress = Math.min(questions.length, step + (isAdvancing ? 0.72 : 0));

  return (
    <div className="flex flex-col gap-8" aria-busy={isAdvancing}>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-muted-foreground text-label tracking-[0.18em] uppercase">
            {question.chapter} <span className="text-ember px-1">/</span>{" "}
            {String(step + 1).padStart(2, "0")}
          </p>
          <p className="text-muted-foreground text-caption">
            Question {step + 1} of {questions.length}
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-valuenow={progress}
          aria-valuetext={`${Math.floor(progress)} of ${questions.length} questions complete`}
          aria-label="Archetype journey progress"
          className="bg-border h-px w-full overflow-hidden"
        >
          <motion.div
            className="bg-ember h-full origin-left"
            initial={false}
            animate={{ scaleX: progress / questions.length }}
            transition={transition.moderate}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={transition.moderate}
          className="flex flex-col gap-6"
        >
          <div>
            <p className="text-ember text-caption tracking-[0.16em] uppercase">
              {question.moment}
            </p>
            <h2
              ref={questionHeadingRef}
              tabIndex={-1}
              className="font-heading text-h2 lg:text-h1 mt-3 max-w-3xl tracking-tight text-balance"
            >
              {question.prompt}
            </h2>
          </div>

          <ul
            className="flex flex-col gap-3"
            aria-label="Choose the image that feels closest"
          >
            {question.choices.map((choice, index) => {
              const isSelected = selectedChoice === choice.text;
              return (
                <motion.li
                  key={choice.text}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transition.base, delay: index * 0.035 }}
                >
                  <motion.button
                    type="button"
                    onClick={() => choose(choice)}
                    disabled={isAdvancing}
                    aria-pressed={isSelected}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.995 }}
                    className={`border-border text-body group relative w-full overflow-hidden rounded-lg border p-4 text-left transition-[background-color,border-color,box-shadow,color] duration-200 sm:p-5 ${
                      isSelected
                        ? "border-ember bg-ember/10 shadow-soft"
                        : "hover:border-ember/50 hover:bg-ember/5"
                    } ${isAdvancing && !isSelected ? "cursor-wait opacity-55" : ""}`}
                  >
                    <span className="relative z-10 block pr-8">
                      {choice.text}
                    </span>
                    <span
                      aria-hidden
                      className={`bg-ember absolute top-1/2 right-5 size-1.5 -translate-y-1/2 rounded-full transition-[transform,opacity] duration-200 ${
                        isSelected
                          ? "scale-100 opacity-100"
                          : "scale-50 opacity-0 group-hover:scale-100 group-hover:opacity-70"
                      }`}
                    />
                  </motion.button>
                </motion.li>
              );
            })}
          </ul>

          {step > 0 && (
            <button
              type="button"
              onClick={() => setAnswers((previous) => previous.slice(0, -1))}
              disabled={isAdvancing}
              className="text-muted-foreground hover:text-foreground text-small self-start transition-colors disabled:opacity-50"
            >
              &larr; Return to the previous room
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
