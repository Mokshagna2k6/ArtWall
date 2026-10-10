"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

import { fadeUp, staggerContainer, viewportOnce } from "@/lib/motion";

/**
 * The element types a reveal can wrap.
 *
 * Resolved from a table declared once at module scope rather than by calling
 * `motion.create()` per render. A factory call during render mints a new
 * component type every pass, so React unmounts and remounts the subtree -
 * state lost, animations restarted from nothing. This is the same capability
 * with none of that risk, and it keeps the wrapper honest about which
 * semantic elements it is willing to produce.
 */
const motionTags = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  span: motion.span,
  p: motion.p,
  ul: motion.ul,
  ol: motion.ol,
  li: motion.li,
  dl: motion.dl,
  dt: motion.dt,
  dd: motion.dd,
} as const;

type RevealTag = keyof typeof motionTags;

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Render as something other than a div - `ul`, `section`, `li`, etc. */
  as?: RevealTag;
  /** Delay before this element's own entrance, in seconds. */
  delay?: number;
  variants?: Variants;
}

/**
 * The site's default scroll entrance, as a wrapper.
 *
 * Every narrative section wants the same thing: content that fades up once as
 * it arrives and then stays put. Writing that inline in each component invites
 * drift - one section at 20px, another at 8px, a third re-triggering on every
 * scroll past. This owns the ceremony so all of them are identical.
 *
 * `viewportOnce` is the important detail: a reveal that re-fires when you
 * scroll back up reads as a page that cannot settle (§12).
 *
 * Reduced motion is handled globally by `MotionProvider` - the fade survives,
 * the travel does not.
 */
export function Reveal({
  children,
  className,
  as = "div",
  delay = 0,
  variants = fadeUp,
}: RevealProps) {
  const Component = motionTags[as];

  return (
    <Component
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      variants={variants}
      transition={delay ? { delay } : undefined}
      className={className}
    >
      {children}
    </Component>
  );
}

interface RevealGroupProps {
  children: ReactNode;
  className?: string;
  as?: RevealTag;
  /** Seconds between each child's entrance. Capped at 90ms by §12. */
  stagger?: number;
}

/**
 * Reveals its children in sequence rather than all at once.
 *
 * Children must be `RevealItem` (or any motion element using the
 * hidden/visible variant names) for the sequence to reach them.
 */
export function RevealGroup({
  children,
  className,
  as = "div",
  stagger = 0.06,
}: RevealGroupProps) {
  const Component = motionTags[as];

  return (
    <Component
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      variants={staggerContainer(stagger)}
      className={className}
    >
      {children}
    </Component>
  );
}

/** A single child of `RevealGroup`. */
export function RevealItem({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: RevealTag;
}) {
  const Component = motionTags[as];

  return (
    <Component variants={fadeUp} className={className}>
      {children}
    </Component>
  );
}
