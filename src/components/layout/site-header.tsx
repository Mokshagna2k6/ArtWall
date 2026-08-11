"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "framer-motion";
import { ChevronDown, Menu, X } from "lucide-react";

import { Wordmark } from "@/components/brand/wordmark";
import { navItems, primaryCta, secondaryNavItems } from "@/config/nav";
import { duration, ease, transition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Magnetic } from "@/shared/magnetic";

const moreNavItems = [
  ...navItems.slice(4),
  {
    label: "Artists",
    href: "/artists",
    description: "Discover artists sharing their work on ArtWall",
  },
  ...secondaryNavItems,
];

/**
 * Primary navigation.
 *
 * Behaviour: transparent over the hero so nothing competes with the first
 * five seconds, then settles into a glass surface once the wall scrolls
 * underneath it (Phase 2 §14, micro-interaction #22).
 *
 * Accessibility: a real <nav> with a labelled landmark; the mobile menu is a
 * modal dialog that traps nothing but manages focus properly — focus moves to
 * the panel on open and returns to the trigger on close, Escape dismisses it,
 * and background scroll is locked while it is open.
 *
 * Performance: the only client state is a boolean for "scrolled" and one for
 * the mobile panel. Scroll is read through Framer's `useScroll` (rAF-batched,
 * passive) rather than a raw scroll listener, so it never thrashes layout.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLLIElement>(null);
  const pathname = usePathname();

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 24);
  });

  // Escape closes the panel; scroll stays locked while it is open.
  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // The desktop overflow menu closes on Escape or when attention moves away.
  // This keeps the full directory available without making a wide header dense.
  useEffect(() => {
    if (!moreOpen) return;

    function dismiss(event: KeyboardEvent | MouseEvent) {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setMoreOpen(false);
      }
      if (
        event instanceof MouseEvent &&
        moreRef.current &&
        !moreRef.current.contains(event.target as Node)
      ) {
        setMoreOpen(false);
      }
    }

    document.addEventListener("keydown", dismiss);
    document.addEventListener("mousedown", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("mousedown", dismiss);
    };
  }, [moreOpen]);

  // Move focus into the panel on open, and back to the trigger on close.
  useEffect(() => {
    if (menuOpen) {
      panelRef.current?.focus();
    } else if (document.activeElement === document.body) {
      triggerRef.current?.focus();
    }
  }, [menuOpen]);

  // A route change must never leave the mobile panel covering the new page.
  // Adjusted during render (React's documented pattern for state derived from
  // a changing value) rather than in an effect: it avoids a cascading render,
  // and unlike an onClick handler it also covers browser back/forward.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMenuOpen(false);
    setMoreOpen(false);
  }

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-100 transition-all duration-300",
        scrolled
          ? "border-border bg-background/90 border-b shadow-sm backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <div className="max-w-wall mx-auto flex h-20 items-center gap-8 px-5 md:px-12 lg:px-16">
        <Link href="/" className="rounded-sm" aria-label="ArtWall — home">
          <Wordmark className="whitespace-nowrap" markClassName="size-6" />
        </Link>

        <nav aria-label="Primary" className="hidden min-w-0 flex-1 md:block">
          <ul className="flex items-center justify-center gap-5 xl:gap-6 2xl:gap-7">
            {navItems.map((item, index) => {
              const active = pathname === item.href;
              return (
                <li
                  key={item.href}
                  className={cn(
                    index === 3 && "hidden lg:block",
                    index === 4 && "hidden 2xl:block",
                    index === 5 && "hidden"
                  )}
                >
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group text-label relative whitespace-nowrap tracking-[0.14em] uppercase transition-colors",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item.label}
                    <span
                      aria-hidden
                      className={cn(
                        "bg-ember absolute -bottom-2 left-0 h-px transition-[width] duration-200 ease-out",
                        active ? "w-full" : "w-0 group-hover:w-full"
                      )}
                    />
                  </Link>
                </li>
              );
            })}
            <li ref={moreRef} className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((open) => !open)}
                aria-expanded={moreOpen}
                aria-controls="header-more-menu"
                className={cn(
                  "text-label hover:text-foreground inline-flex shrink-0 items-center gap-1 whitespace-nowrap tracking-[0.14em] uppercase transition-colors",
                  moreNavItems.some((item) => pathname === item.href)
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                More
                <ChevronDown
                  className={cn(
                    "size-3 transition-transform duration-200",
                    moreOpen && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>
              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    id="header-more-menu"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={transition.base}
                    className="border-border bg-background/98 shadow-medium absolute top-[calc(100%+1.1rem)] left-1/2 w-56 -translate-x-1/2 border p-2"
                  >
                    <p className="text-muted-foreground px-3 pt-2 pb-1 text-[0.65rem] tracking-[0.16em] uppercase">
                      Explore ArtWall
                    </p>
                    <ul>
                      {moreNavItems.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={
                              pathname === item.href ? "page" : undefined
                            }
                            onClick={() => setMoreOpen(false)}
                            className="hover:bg-ember/8 hover:text-foreground block px-3 py-2.5 text-sm transition-colors"
                          >
                            {item.label}
                            <span className="text-muted-foreground mt-0.5 block text-xs">
                              {item.description}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/sign-in"
            className="text-small text-muted-foreground hover:text-foreground hidden transition-colors md:inline-flex"
          >
            Sign in
          </Link>
          <Magnetic className="hidden md:inline-flex">
            <Link
              href={primaryCta.href}
              className="bg-ember text-small text-wall-paper inline-flex h-11 items-center rounded-full px-5 font-semibold transition duration-200 ease-out hover:bg-[color:var(--color-ember)]/90"
            >
              {primaryCta.label}
            </Link>
          </Magnetic>

          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label="Open menu"
            className="text-foreground -mr-2 inline-flex size-11 items-center justify-center rounded-md md:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-menu"
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ duration: duration.moderate, ease: ease.standard }}
            className="bg-background fixed inset-0 z-400 flex flex-col px-5 pt-5 md:hidden"
          >
            <div className="flex h-16 items-center justify-between">
              <span className="font-heading text-h4">Menu</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="text-foreground -mr-2 inline-flex size-11 items-center justify-center rounded-md"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="Mobile" className="mt-8">
              <ul className="flex flex-col gap-2">
                {[...navItems, ...secondaryNavItems].map((item, index) => (
                  <motion.li
                    key={item.href}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      ...transition.base,
                      delay: 0.04 * index + 0.05,
                    }}
                  >
                    <Link
                      href={item.href}
                      className="font-heading text-h3 block py-3 tracking-tight"
                    >
                      {item.label}
                      <span className="text-muted-foreground text-small mt-1 block font-sans tracking-normal">
                        {item.description}
                      </span>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </nav>
            <div className="mt-8 flex flex-col gap-3 border-t pt-6">
              <Link
                href="/artists"
                className="border-border text-body hover:border-ink/30 inline-flex h-12 items-center justify-center rounded-md border transition-colors"
              >
                Explore artists
              </Link>
              <Link
                href="/sign-in"
                className="border-border text-body hover:border-ink/30 inline-flex h-12 items-center justify-center rounded-md border transition-colors"
              >
                Sign in
              </Link>
              <Link
                href={primaryCta.href}
                className="bg-ember text-wall-paper text-body inline-flex h-12 items-center justify-center rounded-md font-medium transition-colors hover:bg-[color:var(--color-ember)]/90"
              >
                {primaryCta.label}
              </Link>
            </div>{" "}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
