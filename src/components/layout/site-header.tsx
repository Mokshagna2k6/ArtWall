"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { ChevronDown, Menu, X } from "lucide-react";

import { Wordmark } from "@/components/brand/wordmark";
import {
  navItems,
  primaryCta,
  secondaryNavItems,
  visibleChildren,
} from "@/config/nav";
import { authClient } from "@/lib/auth-client";
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
 * Performance: the only client state is a boolean for "scrolled", one for the
 * mobile panel, and one naming whichever desktop dropdown is open. Scroll is
 * read through Framer's `useScroll` (rAF-batched, passive) rather than a raw
 * scroll listener, so it never thrashes layout.
 *
 * `physicalWallEnabled` is passed in from the server layout rather than read
 * from the feature flag here. The flag is a plain (non-`NEXT_PUBLIC_`) env var,
 * so in a client component it would inline as `undefined` and the wall menu
 * would never appear however the deployment was configured.
 */
export function SiteHeader({
  physicalWallEnabled = false,
  user = null,
}: {
  physicalWallEnabled?: boolean;
  user?: { id: string; name: string; email: string; image?: string | null } | null;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * Which desktop dropdown is open, by key, or null.
   *
   * One value rather than a boolean per menu: opening the wall menu has to
   * close "More" and vice versa, and a single slot makes that automatic instead
   * of something each trigger has to remember to do.
   */
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLUListElement>(null);
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

  // A desktop dropdown closes on Escape or when attention moves away. Watching
  // the whole nav rather than one menu means a click on another trigger is
  // "inside", so that trigger's own handler decides what opens next instead of
  // fighting a dismiss that already fired.
  useEffect(() => {
    if (!openMenu) return;

    function dismiss(event: KeyboardEvent | MouseEvent) {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setOpenMenu(null);
      }
      if (
        event instanceof MouseEvent &&
        navRef.current &&
        !navRef.current.contains(event.target as Node)
      ) {
        setOpenMenu(null);
      }
    }

    document.addEventListener("keydown", dismiss);
    document.addEventListener("mousedown", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("mousedown", dismiss);
    };
  }, [openMenu]);

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
    setOpenMenu(null);
  }

  /** Is this href the page we are on, or an ancestor of it? */
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

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
          <ul
            ref={navRef}
            className="flex items-center justify-center gap-6 xl:gap-8"
          >
            {navItems.map((item, index) => {
              const children = visibleChildren(item, { physicalWallEnabled });
              const active =
                isCurrent(item.href) ||
                children.some((child) => isCurrent(child.href));

              return (
                <li
                  key={item.href}
                  // The last two give way first on narrower desktops; they are
                  // still one click away in "More" and in the footer.
                  className={cn("relative", index >= 5 && "hidden xl:block")}
                >
                  {children.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenMenu((open) =>
                            open === item.href ? null : item.href
                          )
                        }
                        aria-expanded={openMenu === item.href}
                        aria-controls={`header-menu-${index}`}
                        className={cn(
                          "group relative inline-flex items-center gap-1 py-1 text-sm whitespace-nowrap transition-colors",
                          active
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {item.label}
                        <ChevronDown
                          className={cn(
                            "size-3 transition-transform duration-200",
                            openMenu === item.href && "rotate-180"
                          )}
                          aria-hidden
                        />
                        <span
                          aria-hidden
                          className={cn(
                            "bg-foreground absolute -bottom-0.5 left-0 h-px transition-[width] duration-200 ease-out",
                            active ? "w-full" : "w-0 group-hover:w-full"
                          )}
                        />
                      </button>
                      {/* Plain conditional rather than AnimatePresence.
                          AnimatePresence does not unmount its children in this
                          React/Framer combination: the exit animation runs, the
                          panel reaches opacity 0, and the node stays in the
                          document - an invisible 256px panel that still
                          swallows clicks and still holds focusable links. The
                          entrance still animates; only the exit fade is given
                          up, which on a 220ms dropdown nobody will miss. */}
                      {openMenu === item.href && (
                        <motion.div
                          id={`header-menu-${index}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={transition.base}
                          className="border-border shadow-medium absolute top-[calc(100%+1.25rem)] left-1/2 w-64 -translate-x-1/2 border bg-white p-2"
                        >
                          <ul>
                            {children.map((child) => (
                              <li key={child.href}>
                                <Link
                                  href={child.href}
                                  aria-current={
                                    isCurrent(child.href) ? "page" : undefined
                                  }
                                  onClick={() => setOpenMenu(null)}
                                  className="hover:bg-secondary hover:text-foreground block px-3 py-2.5 text-sm transition-colors"
                                >
                                  {child.label}
                                  <span className="text-muted-foreground mt-0.5 block text-xs">
                                    {child.description}
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      )}
                    </>
                  ) : (
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
                  )}
                </li>
              );
            })}
            <li className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenMenu((open) => (open === "more" ? null : "more"))
                }
                aria-expanded={openMenu === "more"}
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
                    openMenu === "more" && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>
              {/* Conditional, not AnimatePresence — see the note above. This
                  menu had the bug before the wall menu existed: opening and
                  closing "More" left an invisible panel over the page that
                  quietly ate the next click. */}
              {openMenu === "more" && (
                <motion.div
                  id="header-more-menu"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
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
                            onClick={() => setOpenMenu(null)}
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
            </li>
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-4 lg:ml-0">
          {user ? (
            <UserMenu user={user} />
          ) : (
            <>
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
            </>
          )}

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

      {/* Conditional, not AnimatePresence — see the note on the wall menu.
          Left wrapped, this panel stayed in the document after closing: slid
          off-screen and invisible, but still full of links a keyboard user
          could tab into. Losing the slide-out on close is the cost. */}
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
              {[...navItems, ...secondaryNavItems].map((item, index) => {
                const children = visibleChildren(item, {
                  physicalWallEnabled,
                });

                return (
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
                    {/* On a phone the children are simply listed under the
                          parent. A tap-to-expand disclosure would hide two
                          links behind an extra tap to save four lines of a
                          panel that already scrolls. */}
                    {children.length > 0 ? (
                      <div className="py-4">
                        <p className="font-heading text-card">{item.label}</p>
                        <ul className="mt-2 flex flex-col">
                          {children.map((child) => (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                aria-current={
                                  isCurrent(child.href) ? "page" : undefined
                                }
                                className="border-border/60 block border-l py-2.5 pl-4 text-sm"
                              >
                                {child.label}
                                <span className="text-muted-foreground mt-0.5 block text-xs">
                                  {child.description}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <Link
                        href={item.href}
                        className="font-heading text-card block py-4"
                      >
                        {item.label}
                        <span className="text-muted-foreground mt-1 block font-sans text-sm tracking-normal">
                          {item.description}
                        </span>
                      </Link>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          </nav>
          <div className="mt-8 flex flex-col gap-3">
            {user ? (
              <>
                <div className="flex items-center gap-3 px-1 py-2">
                  <UserAvatar user={user} size={36} />
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-medium">
                      {user.name}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {user.email}
                    </p>
                  </div>
                </div>
                <Link
                  href="/studio"
                  className="bg-foreground inline-flex h-12 items-center justify-center px-5 text-sm font-medium text-white"
                >
                  Go to studio
                </Link>
                <SignOutButton className="border-border hover:border-foreground inline-flex h-12 items-center justify-center border px-5 text-sm transition-colors" />
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </motion.div>
      )}
    </header>
  );
}

type UserProp = { name: string; email: string; image?: string | null };

function UserAvatar({ user, size = 32 }: { user: UserProp; size?: number }) {
  if (user.image) {
    return (
      <img
        src={user.image}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    );
  }

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className="bg-foreground inline-flex items-center justify-center rounded-full text-xs font-medium text-white"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function UserMenu({ user }: { user: UserProp }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full"
      >
        <UserAvatar user={user} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition.base}
          className="border-border shadow-medium absolute right-0 top-[calc(100%+0.75rem)] w-56 border bg-white p-2"
        >
          <div className="px-3 py-2">
            <p className="text-foreground truncate text-sm font-medium">
              {user.name}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {user.email}
            </p>
          </div>
          <div className="border-border my-1 border-t" />
          <Link
            href="/studio"
            onClick={() => setOpen(false)}
            className="hover:bg-secondary block px-3 py-2 text-sm transition-colors"
          >
            Studio
          </Link>
          <div className="border-border my-1 border-t" />
          <SignOutButton className="hover:bg-secondary w-full px-3 py-2 text-left text-sm transition-colors" />
        </motion.div>
      )}
    </div>
  );
}

function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleSignOut = useCallback(async () => {
    setPending(true);
    try {
      await authClient.signOut();
      router.refresh();
    } finally {
      setPending(false);
    }
  }, [router]);

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      className={className}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
