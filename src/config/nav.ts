/**
 * Primary wayfinding.
 *
 * Each destination is its own route rather than an anchor on one long page.
 * That gives every experience a shareable URL, its own metadata and social
 * preview, and its own JavaScript bundle - a visitor who only wants to hang
 * their work on a virtual wall never downloads the quiz.
 *
 * The bar reads as a gallery directory, not a product menu: Home, the thing
 * itself (The Wall), what we do (Services), how it works, the two ways in
 * (Archetype, Community), and who we are.
 */
export interface NavItem {
  label: string;
  href: string;
  /** Used in the mobile menu and as the link's accessible description. */
  description: string;
}

export const navItems: readonly NavItem[] = [
  {
    label: "Home",
    href: "/",
    description: "Art lives on the wall",
  },
  {
    label: "The Wall",
    href: "/wall",
    description: "Take your place among the founding artists",
  },
  {
    label: "Services",
    href: "/platform",
    description: "The system behind a fairer art economy",
  },
  {
    label: "How It Works",
    href: "/journey",
    description: "From a sketch to a legacy, in five steps",
  },
  {
    // The archetype is not a header item: it lives inside Community, which is
    // where it does its job of introducing two strangers. Listing it twice in
    // the bar would advertise a page that does not exist.
    label: "Community",
    href: "/community",
    description: "Indiagrapher, the archetype, and the people behind both",
  },
  {
    label: "About",
    href: "/about",
    description: "The company, the mark, and what we're building",
  },
] as const;

export const primaryCta = {
  label: "Join the Wall",
  href: "/join",
} as const;

/**
 * Secondary destinations. Kept out of the primary bar so it stays legible at
 * seven items - these are things people look for deliberately, not while
 * wandering. Every one of them is still a real, linkable page.
 */
export const secondaryNavItems: readonly NavItem[] = [
  {
    label: "See it hung",
    href: "/preview",
    description: "Put your work on a gallery wall",
  },
  {
    label: "Artists",
    href: "/artists",
    description: "Discover artists sharing their work on ArtWall",
  },
  {
    label: "Certification",
    href: "/certificate",
    description: "How we prove a work is yours",
  },
  {
    label: "The Survey",
    href: "/survey",
    description: "Tell us what is broken. Two minutes.",
  },
  {
    label: "Contact",
    href: "/contact",
    description: "Reach the founding team directly",
  },
] as const;
