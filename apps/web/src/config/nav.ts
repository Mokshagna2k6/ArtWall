/**
 * Primary wayfinding.
 *
 * Each destination is its own route rather than an anchor on one long page.
 * That gives every experience a shareable URL, its own metadata and social
 * preview, and its own JavaScript bundle - a visitor who only wants to hang
 * their work on a virtual wall never downloads the quiz.
 *
 * Marketplace-first (docs/archive/plans/CHANGES-PLAN.md §3). The bar leads with the inventory -
 * Discover, Artists, Exhibitions - because "/" is the marketplace now, and a
 * visitor who landed on a wall of art should be able to keep looking at art.
 * The company's argument pages (Services, How It Works, the narrative, the
 * team) have not been dropped: they are grouped behind the last two items,
 * which is what `children` is for.
 *
 * Five primary items, deliberately. The header hides anything from index 5
 * onward below the `xl` breakpoint and repeats it in "More", so a sixth item
 * is a item that disappears on a 1280px laptop.
 */
export interface NavItem {
  label: string;
  href: string;
  /** Used in the mobile menu and as the link's accessible description. */
  description: string;
  /**
   * Sub-destinations, shown as a dropdown in the header.
   *
   * A parent with children keeps its own `href` so the footer and the sitemap
   * still have one canonical URL for it - only the header treats it as a
   * category rather than a destination.
   */
  children?: readonly NavItem[];
  /**
   * Hidden until the physical wall is switched on.
   *
   * There is exactly one wall while the venue is not open, and advertising a
   * second one that returns a not-found is worse than not mentioning it.
   */
  requiresPhysicalWall?: boolean;
}

export const navItems: readonly NavItem[] = [
  {
    label: "Discover",
    href: "/discover",
    description: "Original work from India's contemporary artists",
  },
  {
    label: "Artists",
    href: "/artists",
    description: "The people making the work, and their practices",
  },
  {
    label: "Exhibitions",
    href: "/exhibitions",
    description: "Shows curated by the artists themselves",
  },
  {
    // Two walls: the living collection online, and the real one hanging in the
    // Ric Platter venue. They are different products that share a name, so the
    // header names both rather than making people guess which "The Wall" is.
    label: "The Wall",
    href: "/wall",
    description: "Take your place among the founding artists",
    children: [
      {
        label: "Virtual Wall",
        href: "/wall",
        description: "The living collection of India's artists, online",
      },
      {
        // The walkable 3D building (/virtual). Distinct from "Virtual Wall"
        // above, which is the 2D collection at /wall — two different features
        // whose names collide, so this one is named for what you do in it.
        label: "3D Gallery",
        href: "/virtual",
        description: "Walk through the collection in a 3D museum",
      },
      {
        label: "Physical Wall",
        href: "/physical-wall",
        description: "Real work, hanging at Ric Platter",
        requiresPhysicalWall: true,
      },
      {
        label: "Join the Wall",
        href: "/join",
        description: "Claim a place as a founding artist",
      },
    ],
  },
  {
    // Everything that argues for the platform rather than showing the work.
    // Its own href stays /platform so the footer and the sitemap keep one
    // canonical URL for it; only the header treats it as a category.
    label: "Services",
    href: "/platform",
    description: "The system behind a fairer art economy",
    children: [
      {
        label: "Services",
        href: "/platform",
        description: "The six systems, and what each one fixes",
      },
      {
        label: "Certification",
        href: "/certificate",
        description: "How we prove a work is yours",
      },
      {
        label: "How It Works",
        href: "/journey",
        description: "From a sketch to a legacy, in five steps",
      },
      {
        label: "Community",
        href: "/community",
        description: "Indiagrapher, the archetype, and the people behind both",
      },
      {
        label: "The Survey",
        href: "/survey",
        description: "Tell us what is broken. Two minutes.",
      },
      {
        // /team redirects here permanently (docs/archive/plans/CHANGES-PLAN.md §5); the nav and
        // the sitemap point at the new URL so neither keeps feeding the hop.
        label: "Team",
        href: "/about/team",
        description: "The people building ArtWall",
      },
      {
        // The six-systems narrative that used to be the homepage. Kept
        // reachable (and in the sitemap) now that "/" is the marketplace.
        label: "The Platform",
        href: "/about/platform",
        description: "The six systems, the living map, and the numbers",
      },
    ],
  },
] as const;

/**
 * The signed-in-adjacent CTA, still used by the footer, the mobile menu and
 * the sitemap. The desktop header's logged-out right side is Login + Sign up
 * instead (docs/archive/plans/CHANGES-PLAN.md §3) - a marketplace asks a visitor to make an
 * account, not to join a programme, and "Join the Wall" now also sits inside
 * the The Wall dropdown where an artist looking for it will expect it.
 */
export const primaryCta = {
  label: "Join the Wall",
  href: "/join",
} as const;

/**
 * A nav item's visible children, given what is switched on.
 *
 * Returns an empty array when there is nothing to show *or* only one child is
 * available - a dropdown holding a single link is a worse affordance than the
 * plain link it replaced, so the header falls back to the plain link.
 */
export function visibleChildren(
  item: NavItem,
  { physicalWallEnabled }: { physicalWallEnabled: boolean }
): readonly NavItem[] {
  const children = (item.children ?? []).filter(
    (child) => !child.requiresPhysicalWall || physicalWallEnabled
  );
  return children.length > 1 ? children : [];
}

/**
 * Secondary destinations, for the header's "More" menu and the footer.
 *
 * Most of what used to live here (Certification, The Survey, How It Works,
 * Community) is now grouped under Services in the primary bar, so this is
 * down to the pages that belong to the company rather than to the product.
 * Every one of them is still a real, linkable page, and the sitemap builds
 * from this list, so nothing dropped out of it.
 */
export const secondaryNavItems: readonly NavItem[] = [
  {
    label: "About",
    href: "/about",
    description: "The company, the mark, and what we're building",
  },
  {
    label: "Team",
    href: "/team",
    description: "The people building ArtWall",
  },
  {
    label: "Contact",
    href: "/contact",
    description: "Reach the founding team directly",
  },
] as const;
