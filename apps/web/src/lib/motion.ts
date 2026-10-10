import type { Transition, Variants } from "framer-motion";

/**
 * Shared motion vocabulary.
 *
 * Source of truth: docs/ArtWall_Experience_Design_System.md §12 and §17.
 * Values mirror the CSS custom properties in globals.css - if you change one,
 * change both, so a ceremony feels identical whether it is driven by CSS or JS.
 *
 * Principle: motion tells the story, it does not decorate. Linear easing is
 * never used anywhere in this system - a hand placing a canvas on a wall does
 * not move at constant velocity.
 */

/** Durations in seconds (Framer Motion's unit), mirroring §17. */
export const duration = {
  instant: 0.1,
  fast: 0.15,
  base: 0.22,
  moderate: 0.35,
  slow: 0.55,
  scene: 1.2,
} as const;

/** Soft, slightly overshooting settle for entrances; a faster curve for exits. */
export const ease = {
  standard: [0.22, 1, 0.36, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export const transition = {
  fast: { duration: duration.fast, ease: ease.standard },
  base: { duration: duration.base, ease: ease.standard },
  moderate: { duration: duration.moderate, ease: ease.standard },
  slow: { duration: duration.slow, ease: ease.standard },
  scene: { duration: duration.scene, ease: ease.standard },
  /** Physical settle for taps, ember ignition, and playful confirmations. */
  spring: { type: "spring", stiffness: 210, damping: 20, mass: 1 },
} as const satisfies Record<string, Transition>;

/**
 * The system's default reveal: content fades up as it enters view.
 * Paired with `viewport={{ once: true }}` so it never re-triggers on
 * re-scroll, which would make the page feel twitchy (§12).
 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: transition.moderate },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transition.moderate },
};

/** Modal/overlay entrance - fade while scaling up from 96% (§14, #66). */
export const fadeScale: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: transition.base },
  exit: { opacity: 0, scale: 0.98, transition: { duration: duration.fast } },
};

/**
 * Parent container that reveals children in sequence.
 * Stagger is capped at 90ms per §12 - beyond that a grid feels sluggish
 * rather than choreographed.
 */
export function staggerContainer(stagger = 0.06, delayChildren = 0): Variants {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: stagger, delayChildren },
    },
  };
}

/** Standard viewport trigger for scroll reveals. */
export const viewportOnce = { once: true, amount: 0.3 } as const;
