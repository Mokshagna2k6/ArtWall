import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The shared page furniture for the white-wall layout.
 *
 * These exist so pages stop hand-rolling container widths and vertical
 * rhythm. Before this there were five different hero paddings, five section
 * paddings and four container widths across nine pages; the differences were
 * invisible one page at a time and obvious when you scrolled between them.
 *
 * Three measures, one section rhythm, one hairline. Anything a page needs
 * beyond this should probably not be bespoke.
 *
 * All Server Components - pure layout, no JavaScript shipped.
 */

/**
 * Horizontal measure.
 *
 * `page` for grids, `text` for prose that must stay readable, `narrow` for
 * forms. `bleed` opts out entirely, for full-width artwork bands that should
 * run to the edge of the viewport.
 */
export function Container({
  children,
  size = "page",
  className,
}: {
  children: ReactNode;
  size?: "page" | "text" | "narrow" | "bleed";
  className?: string;
}) {
  if (size === "bleed") {
    return <div className={cn("w-full", className)}>{children}</div>;
  }

  return (
    <div
      className={cn(
        "mx-auto w-full px-5 sm:px-8 lg:px-16",
        size === "page" && "max-w-page",
        size === "text" && "max-w-text",
        size === "narrow" && "max-w-narrow",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * The standard page hero.
 *
 * Every top-of-page block used to invent its own padding. This is the one
 * value, and it accounts for the fixed header: the top padding has to clear
 * an 18-unit bar before the eyebrow starts.
 */
export function PageHero({
  children,
  className,
  size = "page",
}: {
  children: ReactNode;
  className?: string;
  size?: "page" | "text" | "narrow";
}) {
  return (
    <section
      className={cn(
        "pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-48 lg:pb-24",
        className
      )}
    >
      <Container size={size}>{children}</Container>
    </section>
  );
}

/**
 * A chapter of a page.
 *
 * `divide` draws the hairline that separates chapters. On a white page the
 * rule does the work a background colour would do elsewhere, so it is the
 * default rather than something people remember to add.
 */
export function Section({
  children,
  id,
  className,
  divide = true,
  size = "page",
}: {
  children: ReactNode;
  id?: string;
  className?: string;
  divide?: boolean;
  size?: "page" | "text" | "narrow" | "bleed";
}) {
  return (
    <section
      id={id}
      className={cn(
        "py-20 sm:py-24 lg:py-32",
        divide && "border-border border-t",
        className
      )}
    >
      <Container size={size}>{children}</Container>
    </section>
  );
}

/** A quiet band. Used sparingly - two in a row and the page stops being white. */
export function Band({
  children,
  id,
  size = "page",
  className,
}: {
  children: ReactNode;
  id?: string;
  size?: "page" | "text" | "narrow" | "bleed";
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "border-border bg-secondary border-t py-20 sm:py-24 lg:py-32",
        className
      )}
    >
      <Container size={size}>{children}</Container>
    </section>
  );
}

/**
 * The gallery placard.
 *
 * The single eyebrow for the whole site. This role previously had eight
 * different sizes, seven trackings and four colours across the codebase -
 * including two "shared" components that disagreed with each other by 16%.
 *
 * `align="center"` exists because the wall page needs a centred one and was
 * passing `justify-center` to what is a `<p>`, where it did nothing.
 */
export function Eyebrow({
  children,
  index,
  align = "left",
  className,
}: {
  children: ReactNode;
  index?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-signal text-eyebrow uppercase",
        align === "center" && "text-center",
        className
      )}
    >
      {index && (
        <span className="text-signal/55 mr-3 tabular-nums">{index}</span>
      )}
      {children}
    </p>
  );
}

/**
 * The oversized chapter numeral.
 *
 * Purely typographic decoration in the section gutter - it carries no
 * information the eyebrow does not already state, so it is hidden from
 * assistive tech rather than read out as a stray number.
 */
export function ChapterNumeral({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "font-heading text-numeral text-hairline pointer-events-none block select-none",
        className
      )}
    >
      {children}
    </span>
  );
}

/** A solid ink call to action. There is only ever one of these in view. */
export function InkLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "bg-foreground hover:bg-ember-glow inline-flex h-11 items-center justify-center px-5 text-sm font-medium text-white transition-colors",
        className
      )}
    >
      {children}
    </a>
  );
}

/** The quieter sibling: a hairline box that fills with ink on hover. */
export function OutlineLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "border-border hover:border-foreground hover:bg-foreground inline-flex h-11 items-center justify-center border px-5 text-sm font-medium transition-colors hover:text-white",
        className
      )}
    >
      {children}
    </a>
  );
}
