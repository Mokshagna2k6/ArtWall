"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";

import { transition } from "@/lib/motion";

interface MagneticProps {
  children: ReactNode;
  /**
   * How far the element travels toward the cursor, in px.
   * Kept deliberately small - magnetism should be felt, not watched.
   */
  strength?: number;
  className?: string;
}

/**
 * Wraps a control so it drifts subtly toward the cursor on approach
 * (Phase 2 §14, micro-interaction #2).
 *
 * Why it exists: it makes the interface feel like it is responding to *your*
 * presence, which is the "presence over performance" principle. It is applied
 * sparingly - primary CTAs only, never every button.
 *
 * Accessibility: the effect is purely decorative transform. It never moves an
 * element far enough to escape its own hit area, is skipped entirely under
 * `prefers-reduced-motion`, and does nothing on touch devices (no hover, so
 * `pointermove` from a finger never fires the approach). Keyboard focus is
 * unaffected - the child keeps its own focus ring.
 *
 * Performance: animates `transform` only (GPU-composited, no layout work), and
 * reads geometry once per pointer event rather than on every frame.
 */
export function Magnetic({ children, strength = 6, className }: MagneticProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, transition.spring);
  const springY = useSpring(y, transition.spring);

  function handlePointerMove(event: React.PointerEvent<HTMLSpanElement>) {
    // Only true pointing devices get magnetism; a finger has no "approach".
    if (prefersReducedMotion || event.pointerType !== "mouse" || !ref.current) {
      return;
    }

    const rect = ref.current.getBoundingClientRect();
    const offsetX = event.clientX - (rect.left + rect.width / 2);
    const offsetY = event.clientY - (rect.top + rect.height / 2);

    // Normalise to the element's own half-extent so large and small controls
    // feel equally magnetic rather than the big one flying further.
    x.set((offsetX / (rect.width / 2)) * strength);
    y.set((offsetY / (rect.height / 2)) * strength);
  }

  function reset() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.span
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      style={{ x: springX, y: springY }}
      className={className}
    >
      {children}
    </motion.span>
  );
}
