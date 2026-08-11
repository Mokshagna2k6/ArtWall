/**
 * Primary wayfinding.
 *
 * Each feature is its own route rather than an anchor on one long page. That
 * gives every experience a shareable URL, its own metadata and social preview,
 * and its own JavaScript bundle — a visitor who only wants to hang their work
 * on a virtual wall never downloads the quiz.
 *
 * Kept to five destinations plus one CTA so the bar reads as a gallery
 * directory, not a product menu.
 */
export interface NavItem {
  label: string;
  href: string;
  /** Used in the mobile menu and as the link's accessible description. */
  description: string;
}

export const navItems: readonly NavItem[] = [
  {
    label: "The Wall",
    href: "/wall",
    description: "Take your place among the founding artists",
  },
  {
    label: "See it hung",
    href: "/preview",
    description: "Put your work on a gallery wall",
  },
  {
    label: "Archetype",
    href: "/archetype",
    description: "Find the artist you already are",
  },
  {
    label: "The Journey",
    href: "/journey",
    description: "From a sketch to a legacy",
  },
  {
    label: "The Platform",
    href: "/platform",
    description: "The system behind a fairer art economy",
  },
  {
    label: "Living Map",
    href: "/india",
    description: "India's art cities, lighting up one artist at a time",
  },
] as const;

export const primaryCta = {
  label: "Join the Wall",
  href: "/join",
} as const;

/**
 * Secondary destinations. Kept out of the primary bar so the nav stays at four
 * items — these are things people look for deliberately, not while wandering.
 */
export const secondaryNavItems: readonly NavItem[] = [
  {
    label: "Certification",
    href: "/certificate",
    description: "How we prove a work is yours",
  },
  {
    label: "About",
    href: "/about",
    description: "The company, the mark, and what we're building",
  },
  {
    label: "Contact",
    href: "/contact",
    description: "Reach the founding team directly",
  },
] as const;
