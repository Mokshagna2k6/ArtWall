/**
 * What Artwall Labs is building.
 *
 * Kept as data rather than markup so the launch list, the about page, and any
 * future product page all read from one source and cannot drift out of sync.
 */
export interface Product {
  name: string;
  audience: string;
  line: string;
  /** Ships in the Diwali 2026 launch window. */
  atLaunch: boolean;
}

export const products: readonly Product[] = [
  {
    name: "Artwall Platform",
    audience: "Flagship",
    line: "Exhibition, certification, and marketplace, the core that connects artists, collectors, and venues.",
    atLaunch: true,
  },
  {
    name: "Backstage",
    audience: "B2B",
    line: "Exhibition management for galleries and venues, plan, coordinate, and run shows end to end.",
    atLaunch: true,
  },
  {
    name: "Events by Artwall",
    audience: "B2B · B2C",
    line: "Software for artists to organise exhibitions, workshops, and ticketed gatherings.",
    atLaunch: true,
  },
  {
    name: "Fine Art Community",
    audience: "B2C",
    line: "Artists connect, collaborate, and grow together across traditions and regions.",
    atLaunch: true,
  },
  {
    name: "Artwall Stores",
    audience: "B2B · B2C",
    line: "Curated physical and online stores for certified artworks.",
    atLaunch: true,
  },
  {
    name: "Online Consultancy",
    audience: "B2C",
    line: "Art advisory, collection building, and investment guidance.",
    atLaunch: true,
  },
  {
    name: "Exhibition Workshops",
    audience: "B2C",
    line: "Learn curation, art handling, and exhibition design from people who do it.",
    atLaunch: true,
  },
  {
    name: "Artist Booking",
    audience: "B2B · B2C",
    line: "Book artists for commissions, live painting, workshops, and collaborations.",
    atLaunch: false,
  },
  {
    name: "Ticketing & Events App",
    audience: "B2B · B2C",
    line: "Exhibition tickets, art walks, workshops, plan, sell, and manage seamlessly.",
    atLaunch: false,
  },
];

/**
 * The lifecycle an artwork passes through in the ArtWall system.
 * This is the company's own framing of the product, told as a life story.
 */
export const lifecycle = [
  {
    step: "Genesis",
    line: "The artwork is born, an idea becomes material form.",
  },
  {
    step: "Exhibition",
    line: "Displayed on walls across cafés, hotels, and galleries.",
  },
  {
    step: "Verification",
    line: "Tamper-proof certification, immutable proof of origin and authenticity.",
  },
  {
    step: "Exchange",
    line: "Fair trade between creator and collector, the artist earns on every resale.",
  },
  {
    step: "Endurance",
    line: "The work outlasts its maker, provenance and legacy preserved permanently.",
  },
] as const;

/** The four elements of the mark, in the brand's own words. */
export const markElements = [
  {
    name: "The Wall",
    line: "Open L-frame, broken, because an exhibition is an invitation.",
  },
  {
    name: "The Lab",
    line: "Sealed square, immutability, mathematical proof.",
  },
  {
    name: "The Seed",
    line: "Amber dot at the origin, where the artist begins.",
  },
  {
    name: "The Void",
    line: "The overlap, not emptiness, but where creator meets collector.",
  },
] as const;
