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

/**
 * Primary navigation.
 *
 * Behaviour: sits on plain white and gains a single hairline once the page
 * scrolls underneath it. No glass, no shadow, no colour - the rule is the
 * whole treatment, which is what keeps a white site feeling like a gallery
 * rather than a dashboard.
 *
 * Typography: sentence case at 14px rather than tracked-out uppercase. Seven
 * destinations only fit on one line if the labels are set the way a printed
 * directory would set them, and it reads calmer besides.
 *
 * Accessibility: a real <nav> with a labelled landmark; the mobile menu is a
 * modal dialog that manages focus properly - focus moves to the panel on open
 * and returns to the trigger on close, Escape dismisses it, and background
 * scroll is locked while it is open.
 *
 * Performance: the only client state is a boolean for "scrolled" and one each
 * for the two menus. Scroll is read through Framer's `useScroll` (rAF-batched,
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
  // This keeps the full directory available without making the bar dense.
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
        "fixed inset-x-0 top-0 z-100 bg-white transition-[border-color] duration-300",
        scrolled ? "border-border border-b" : "border-b border-transparent"
      )}
    >
      <div className="max-w-page mx-auto flex h-18 items-center gap-8 px-5 sm:px-8 lg:px-16">
        <Link href="/" className="rounded-sm" aria-label="ArtWall, home">
          <Wordmark className="whitespace-nowrap" markClassName="size-6" />
        </Link>

        <nav aria-label="Primary" className="hidden min-w-0 flex-1 lg:block">
          <ul className="flex items-center justify-center gap-6 xl:gap-8">
            {navItems.map((item, index) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <li
                  key={item.href}
                  // The last two give way first on narrower desktops; they are
                  // still one click away in "More" and in the footer.
                  className={cn(index >= 5 && "hidden xl:block")}
                >
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative block py-1 text-sm whitespace-nowrap transition-colors",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item.label}
                    <span
                      aria-hidden
                      className={cn(
                        "bg-foreground absolute -bottom-0.5 left-0 h-px transition-[width] duration-200 ease-out",
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
                  "hover:text-foreground inline-flex shrink-0 items-center gap-1 py-1 text-sm whitespace-nowrap transition-colors",
                  secondaryNavItems.some((item) => pathname === item.href)
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
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 2 }}
                    transition={transition.base}
                    className="border-border shadow-medium absolute top-[calc(100%+1.25rem)] right-0 w-64 border bg-white p-2"
                  >
                    <p className="text-muted-foreground text-eyebrow px-3 pt-2 pb-1">
                      Explore ArtWall
                    </p>
                    <ul>
                      {/* On narrower desktops the last two primary items are
                          hidden above, so they are repeated here. */}
                      {[...navItems.slice(5), ...secondaryNavItems].map(
                        (item, index) => (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              aria-current={
                                pathname === item.href ? "page" : undefined
                              }
                              onClick={() => setMoreOpen(false)}
                              className={cn(
                                "hover:bg-secondary hover:text-foreground block px-3 py-2.5 text-sm transition-colors",
                                index < navItems.length - 5 && "xl:hidden"
                              )}
                            >
                              {item.label}
                              <span className="text-muted-foreground mt-0.5 block text-xs">
                                {item.description}
                              </span>
                            </Link>
                          </li>
                        )
                      )}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-4 lg:ml-0">
          <Link
            href="/sign-in"
            className="text-muted-foreground hover:text-foreground hidden text-sm transition-colors lg:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href={primaryCta.href}
            className="bg-foreground hidden h-10 items-center px-5 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#2b3245] lg:inline-flex"
          >
            {primaryCta.label}
          </Link>

          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label="Open menu"
            className="text-foreground -mr-2 inline-flex size-11 items-center justify-center lg:hidden"
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
            className="fixed inset-0 z-400 flex flex-col overflow-y-auto bg-white px-5 pt-5 pb-10 lg:hidden"
          >
            <div className="flex h-13 items-center justify-between">
              <span className="text-muted-foreground text-eyebrow">Menu</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="text-foreground -mr-2 inline-flex size-11 items-center justify-center"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="Mobile" className="mt-6">
              <ul className="border-border flex flex-col border-t">
                {[...navItems, ...secondaryNavItems].map((item, index) => (
                  <motion.li
                    key={item.href}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      ...transition.base,
                      delay: 0.03 * index + 0.04,
                    }}
                    className="border-border border-b"
                  >
                    <Link
                      href={item.href}
                      className="font-heading text-card block py-4"
                    >
                      {item.label}
                      <span className="text-muted-foreground mt-1 block font-sans text-sm tracking-normal">
                        {item.description}
                      </span>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </nav>
            <div className="mt-8 flex flex-col gap-3">
              <Link
                href={primaryCta.href}
                className="bg-foreground inline-flex h-12 items-center justify-center px-5 text-sm font-medium text-white"
              >
                {primaryCta.label}
              </Link>
              <Link
                href="/sign-in"
                className="border-border hover:border-foreground inline-flex h-12 items-center justify-center border px-5 text-sm transition-colors"
              >
                Sign in
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
