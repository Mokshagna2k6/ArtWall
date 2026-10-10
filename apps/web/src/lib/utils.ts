import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The design system's custom font-size steps.
 *
 * These must be declared to tailwind-merge or it cannot tell them apart from
 * text *colour* utilities, which share the `text-` prefix. Left undeclared,
 * `cn("text-numeral text-hairline")` looked like two classes from one group
 * and the size was silently dropped - the chapter numerals rendered at body
 * size with no error anywhere.
 *
 * Keep in sync with the `--text-*` tokens in globals.css.
 */
const FONT_SIZES = [
  "display",
  "section",
  "subsection",
  "card",
  "lead",
  "body",
  "small",
  "eyebrow",
  "numeral",
] as const;

/**
 * The custom palette, for the same reason in the other direction: without it
 * a colour like `text-signal` could be mistaken for a size and dropped when
 * merged against one.
 */
const COLORS = [
  "wall-black",
  "wall-charcoal",
  "wall-elevated",
  "wall-paper",
  "ember",
  "ember-glow",
  "lab-blue",
  "terracotta",
  "ink",
  "ink-muted",
  "hairline",
  "hairline-strong",
  "band",
  "signal",
  "signal-bright",
  "footer",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZES] }],
      "text-color": [{ text: [...COLORS] }],
      "bg-color": [{ bg: [...COLORS] }],
      "border-color": [{ border: [...COLORS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
