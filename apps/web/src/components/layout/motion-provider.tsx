"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

import { duration, ease } from "@/lib/motion";

/**
 * Global motion policy.
 *
 * `reducedMotion="user"` is the important part: it makes *every* Framer Motion
 * component in the tree automatically drop transform/layout animation when the
 * OS asks for reduced motion, without each component having to remember to
 * check. Components still branch on the preference individually where they owe
 * the user a meaningful static fallback (a stamped seal instead of a stamping
 * animation, say) - this is the safety net beneath that.
 *
 * Setting the default transition here also means a component that specifies no
 * transition still eases organically rather than falling back to Framer's
 * default, so nothing in the system ever moves at a robotic constant velocity.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: duration.base, ease: ease.standard }}
    >
      {children}
    </MotionConfig>
  );
}
