"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

import { duration, ease } from "@/lib/motion";

interface CountUpProps {
  /** The real value. Rendered as-is on the server and without JavaScript. */
  to: number;
  from?: number;
  /** Seconds. Slower than a UI transition - a number climbing is the content. */
  seconds?: number;
  format?: (value: number) => string;
  className?: string;
}

const defaultFormat = (value: number) =>
  Math.round(value).toLocaleString("en-IN");

/**
 * A figure that climbs to its value as it arrives on screen.
 *
 * Two decisions worth keeping:
 *
 * 1. The final value is the element's server-rendered content. Anyone without
 *    JavaScript, any crawler, and any screen reader that reaches the node
 *    before hydration sees the true number - never a zero that never moves.
 * 2. The animation writes `textContent` through a ref rather than through
 *    state. Sixty re-renders a second to redraw one string is the kind of cost
 *    that only shows up on the cheap Android a lot of our artists are using.
 *
 * Under `prefers-reduced-motion` nothing is touched at all: the number is
 * simply there, which is the correct fallback for content that is a fact
 * rather than a flourish.
 */
export function CountUp({
  to,
  from = 0,
  seconds = 1.4,
  format = defaultFormat,
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView || prefersReducedMotion) return;

    // Snap to the start only once we know we can animate, so the true value is
    // never replaced by a placeholder that might get stranded there.
    node.textContent = format(from);

    const controls = animate(from, to, {
      duration: seconds,
      ease: ease.standard,
      onUpdate: (value) => {
        node.textContent = format(value);
      },
      onComplete: () => {
        node.textContent = format(to);
      },
    });

    return () => controls.stop();
  }, [inView, prefersReducedMotion, from, to, seconds, format]);

  return (
    <span ref={ref} className={className}>
      {format(to)}
    </span>
  );
}

/** Shared timing so a counter and the bar beside it finish together. */
export const countUpSeconds = duration.scene;
