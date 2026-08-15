/**
 * Site copy, as data.
 *
 * Every marketing claim on the public site is written once, here, and read by
 * the page that shows it. The reason is not tidiness: these are numbers and
 * product claims that appear on four or five surfaces each, and a figure that
 * is right on the services page and stale on the home page is worse than no
 * figure at all.
 *
 * Source of truth for wording: the ArtWall Labs site content brief.
 */

import type { StaticImageData } from "next/image";

/* ── The bar under the hero ────────────────────────────────────────────── */

export const stats = [
  { value: "7M+", label: "Indian artisans" },
  { value: "₹30,000 Cr", label: "Market opportunity" },
  { value: "24", label: "Pain points solved" },
  { value: "6", label: "Patent clusters" },
  { value: "7", label: "Domain moat" },
] as const;

/* ── Services: the six integrated systems ──────────────────────────────── */

/**
 * Static imports rather than string paths.
 *
 * Next reads the real width and height at build time, so every image reserves
 * its exact space before it loads and the six systems never shift under the
 * reader's cursor. It also fingerprints the file, which a `/public` string
 * path does not — and it means a typo in a filename is a build error rather
 * than a broken image somebody notices in production.
 *
 * The filenames carry spaces because that is how they arrived. The import
 * handles the encoding, and containing it to this one file is why the rest of
 * the codebase never has to think about it.
 */
import artistRegistryImage from "../../public/Artist Registry and Profile.png";
import exhibitionEngineImage from "../../public/Exhibition Engine.png";
import provenanceImage from "../../public/Provenance and COA.png";
import marketplaceImage from "../../public/Art Marketplace.png";
// The "2" variant, deliberately: the other file is the only portrait image in
// the set, and one tall card in a grid of six wide ones reads as a mistake.
import antiFraudImage from "../../public/Nine-Layer Anti-Fraud Engine2.png";
import demandTriggeredImage from "../../public/Demand-Triggered Sale.png";

export interface Service {
  number: string;
  title: string;
  summary: string;
  detail: string;
  /** The system diagram. Illustrative, so it is never the only way to read a claim. */
  image: StaticImageData;
  /**
   * Described rather than named: "diagram of the artist registry" tells a
   * screen-reader user nothing the adjacent heading has not already said, so
   * each one says what the diagram actually shows.
   */
  imageAlt: string;
}

export const services: readonly Service[] = [
  {
    number: "01",
    title: "Artist Registry and Profile",
    summary:
      "Four-tier verification, and a profile that doubles as your business hub.",
    detail:
      "DigiLocker KYC, AI document scan, curator review and peer endorsement. Your profile carries portfolio, exhibitions, sales, provenance, earnings and GST invoicing. Vernacular CMS, 300+ artforms, multi-language interface.",
    image: artistRegistryImage,
    imageAlt:
      "The four verification tiers an artist passes through, from DigiLocker identity check to peer endorsement, feeding a single verified profile.",
  },
  {
    number: "02",
    title: "Exhibition Engine",
    summary:
      "AI matching that puts work on real walls: galleries, hotels, coworking spaces.",
    detail:
      "CLIP embeddings weighed against foot traffic, demographics and demand signals to place a work where the right people will actually stand in front of it. Zero cost for artists.",
    image: exhibitionEngineImage,
    imageAlt:
      "Artworks matched to physical venues by light, scale and audience, placing each piece on the wall where its buyer already stands.",
  },
  {
    number: "03",
    title: "Provenance and COA",
    summary: "A certificate that travels with the work, for life.",
    detail:
      "NTAG424 NFC DNA tags (AES-128), QR verification, certificates on Polygon, and CNN image binding tying the physical object to its record. ₹500–2,500 per certificate, against ₹5,000–50,000 elsewhere.",
    image: provenanceImage,
    imageAlt:
      "A physical artwork bound to its on-chain certificate by an NFC tag and image fingerprint, so the object and its record cannot be separated.",
  },
  {
    number: "04",
    title: "Art Marketplace",
    summary: "10% commission, against an industry standard of 40–60%.",
    detail:
      "Escrow through Razorpay and smart contracts. A 72-hour inspection window. EMI, Art-on-Rent from ₹500 a month, and a 15% student discount. Secondary market at a 5% fee.",
    image: marketplaceImage,
    imageAlt:
      "A sale moving through escrow to a 72-hour inspection window before the artist is paid, at a tenth of the usual commission.",
  },
  {
    number: "05",
    title: "Nine-Layer Anti-Fraud Engine",
    summary: "Nine independent checks between a forgery and a collector.",
    detail:
      "Identity, CNN image comparison, NFC binding, blockchain record, escrow, behavioural ML, payment screening, community reporting and human review. Designed for a 99%+ block rate and under 2% disputes.",
    image: antiFraudImage,
    imageAlt:
      "Nine independent checks stacked between a forgery and a collector, from identity and image comparison through to human review.",
  },
  {
    number: "06",
    title: "Demand-Triggered Sale",
    summary: "Patented. No prior art anywhere in the world.",
    detail:
      "Five weighted demand signals accumulate until they cross the threshold the artist set, and only then does the work unlock. Plus a 4% perpetual royalty on every resale, enforced by ERC-2981 on Polygon.",
    image: demandTriggeredImage,
    imageAlt:
      "Five weighted demand signals accumulating toward the threshold an artist set, at which point the work unlocks for sale.",
  },
] as const;

/* ── How it works: registration to royalties ───────────────────────────── */

export interface Step {
  number: string;
  title: string;
  detail: string;
}

export const howItWorks: readonly Step[] = [
  {
    number: "01",
    title: "Register and verify",
    detail:
      "Create your Artist Registry profile and complete four-tier verification: DigiLocker Aadhaar KYC, AI document scan, curator review and peer endorsement. The verified profile is yours and portable.",
  },
  {
    number: "02",
    title: "Upload and certify",
    detail:
      "Add work to a vernacular-first catalogue covering 300+ artforms. Each piece receives a provenance certificate on Polygon, and an NFC tag physically binds the object to its on-chain record.",
  },
  {
    number: "03",
    title: "Exhibit and be discovered",
    detail:
      "The Exhibition Engine matches your work with the right spaces and audiences: galleries, hotels, coworking floors, public lobbies. Zero cost to the artist. NFC-tagged walls make discovery continuous.",
  },
  {
    number: "04",
    title: "Sell with trust",
    detail:
      "Demand-Triggered Sale gathers verified buyer interest until it crosses your threshold, and the work unlocks. 10% commission, Razorpay escrow, a 72-hour inspection window, EMI and Art-on-Rent for buyers.",
  },
  {
    number: "05",
    title: "Earn royalties, permanently",
    detail:
      "ERC-2981 contracts on Polygon enforce a 4% royalty on every resale. Not a promise in a contract nobody reads. A rule that is technically difficult to evade, with every secondary sale visible to you.",
  },
] as const;

/* ── Who it is for ─────────────────────────────────────────────────────── */

export interface Audience {
  key: string;
  label: string;
  headline: string;
  points: readonly string[];
  cta: { label: string; href: string };
}

export const audiences: readonly Audience[] = [
  {
    key: "artists",
    label: "Artists",
    headline: "Your profile powers everything.",
    points: [
      "Free four-tier verification: DigiLocker KYC, AI scan, curator review, peer endorsement",
      "The registry is a business hub: portfolio, exhibitions, sales, provenance, earnings, analytics, GST invoicing",
      "Keep 90% of every sale, on a 10% platform commission",
      "A perpetual 4% royalty on every resale, through ERC-2981 on Polygon",
      "Vernacular-first CMS, 300+ artforms, multi-language interface across 29 states",
      "Plans: Free for five artworks, then ₹499, ₹1,499 and ₹4,999 a month",
    ],
    cta: { label: "Join as an artist", href: "/join" },
  },
  {
    key: "galleries",
    label: "Galleries",
    headline: "Exhibition and gallery management, in one place.",
    points: [
      "Exhibition management: event wizard, artist curation, scheduling, ticketing, analytics",
      "Gallery operations: inventory, artist roster, sales tracking, GST-automated invoicing",
      "Blockchain provenance and a COA for every work, on Polygon with NFC binding",
      "CuratorConnect: find verified artists from the Indiagrapher community",
      "Secondary market tracking: resales, royalties, and a complete price history",
      "DPDP-compliant data handling, consent management and reporting from day one",
    ],
    cta: { label: "Partner as a gallery", href: "/contact" },
  },
  {
    key: "collectors",
    label: "Collectors",
    headline: "Buy with certainty. Own with confidence.",
    points: [
      "Every work verified four ways: identity, CNN image comparison, NFC and blockchain provenance",
      "A 72-hour inspection window, with AI image comparison on delivery",
      "A complete price history, built from demand signals and provenance records",
      "EMI over 3, 6 or 12 months, Art-on-Rent from ₹500 a month, and a 15% student discount",
      "Escrow through Razorpay (RBI-licensed) and smart contracts",
    ],
    cta: { label: "Start collecting", href: "/artists" },
  },
] as const;

/* ── The 24 failures, by stage ─────────────────────────────────────────── */

export interface PainStage {
  stage: string;
  problem: string;
  fixes: readonly string[];
}

export const painStages: readonly PainStage[] = [
  {
    stage: "Create",
    problem: "No identity, no income, no tools",
    fixes: [
      "Around half of the market is forged, answered by four-tier verification",
      "Most artists are financially vulnerable, answered by 10% commission against 40–60%",
      "Almost no vernacular tooling exists, answered by a CMS covering 300+ artforms",
      "Copyright is effectively unenforceable, answered by blockchain provenance as evidence",
    ],
  },
  {
    stage: "Exhibit",
    problem: "₹1 lakh to show, metro-only, and seasonal",
    fixes: [
      "The overwhelming majority of artists are priced out, the Exhibition Engine costs them nothing",
      "Most infrastructure sits in three metros, ArtWall is built for tier 1 to tier 3",
      "Seasonal haats leave most of the year dark, NFC-tagged walls make discovery continuous",
    ],
  },
  {
    stage: "Verify",
    problem: "Widespread forgery, and no standard",
    fixes: [
      "A nine-layer anti-fraud engine, designed for a 99%+ block rate",
      "Immutable certificates on Polygon, bound to the object with NFC",
      "₹500–2,500 per certificate, against ₹5,000–50,000 elsewhere",
    ],
  },
  {
    stage: "Sell",
    problem: "40–60% commission, and no escrow",
    fixes: [
      "Artists keep 90%, the platform takes 10%",
      "Razorpay and smart-contract escrow, with a 72-hour inspection window",
      "Indexed artist pages, QR traffic, and a reputation the artist can take with them",
    ],
  },
  {
    stage: "Royalty",
    problem: "Nothing at all from the secondary market",
    fixes: [
      "A 4% perpetual royalty via ERC-2981 on Polygon",
      "Section 53A resale right, automated on-chain and PMLA-compliant",
      "Every resale visible in the artist's own dashboard",
    ],
  },
  {
    stage: "Buy",
    problem: "A trust deficit, and no way in",
    fixes: [
      "Four-tier identity, CNN image comparison, NFC and blockchain verification",
      "A 72-hour window with AI image comparison on delivery",
      "EMI over 3, 6 or 12 months, Art-on-Rent, and a 15% student discount",
    ],
  },
] as const;

/* ── Competitive landscape ─────────────────────────────────────────────── */

export const competitorDomains = [
  "Exhibition",
  "Demand",
  "Provenance",
  "NFC",
  "Anti-fraud",
  "Escrow",
  "Royalty",
] as const;

export interface Competitor {
  name: string;
  /** One flag per domain, in the order of `competitorDomains`. */
  covers: readonly boolean[];
}

export const competitors: readonly Competitor[] = [
  {
    name: "Saatchi Art",
    covers: [false, false, false, false, false, false, false],
  },
  {
    name: "Fairchain",
    covers: [false, false, true, false, false, false, false],
  },
  { name: "Arcual", covers: [false, false, false, false, false, false, true] },
  { name: "Artclear", covers: [false, false, true, true, false, false, false] },
  {
    name: "Indiewalls",
    covers: [true, false, false, false, false, false, false],
  },
  {
    name: "AstaGuru",
    covers: [false, false, false, false, false, false, false],
  },
] as const;

/* ── What people say ───────────────────────────────────────────────────── */

export const testimonials = [
  {
    quote:
      "ArtWall gave me my first exhibition without spending a single rupee on gallery rental. My paintings were seen by people who actually cared, and I was paid fairly.",
    attribution: "Practising artist",
    context: "Indiagrapher member, Jaipur",
  },
  {
    quote:
      "The gallery management software changed how we handle exhibitions: scheduling, artist curation, ticketing and provenance all in one place.",
    attribution: "Gallery partner",
    context: "Delhi",
  },
  {
    quote:
      "For the first time I could verify authenticity before buying: an NFC tag, a blockchain certificate, and a 72-hour inspection window. This is how art should be sold.",
    attribution: "Early-access collector",
    context: "Delhi",
  },
] as const;

/* ── Frequently asked ──────────────────────────────────────────────────── */

export const faqs = [
  {
    question: "What is ArtWall Labs?",
    answer:
      "A DPIIT-recognised AI and technology company building India's art operating system: an artist registry, AI-matched exhibitions, blockchain provenance, demand-triggered sales, and a fair marketplace for seven million artisans.",
  },
  {
    question: "What commission does ArtWall charge?",
    answer:
      "10% on first-hand sales, against an industry standard of 40–60%. Artists also earn a perpetual 4% royalty on every resale, through ERC-2981 smart contracts on Polygon.",
  },
  {
    question: "How does blockchain provenance work?",
    answer:
      "Every artwork receives a provenance certificate minted on Polygon, and an NTAG424 NFC DNA tag is physically bound to the work. Every transfer and resale is recorded permanently against that record.",
  },
  {
    question: "What is a Demand-Triggered Sale?",
    answer:
      "A patented mechanism with no prior art worldwide. Five weighted demand signals produce a composite score, and the work unlocks only once that score crosses the threshold the artist set.",
  },
  {
    question: "Is ArtWall DPDP compliant?",
    answer:
      "Yes. The framework was designed in from day one and self-assessment is complete, with a third-party audit planned in year one. Data is held on AWS Mumbai (ap-south-1), with India data residency.",
  },
  {
    question: "How do I join as an artist?",
    answer:
      "Create an account, then complete four-tier verification: DigiLocker KYC, document upload, curator review and peer endorsement. Upload your work. The free plan covers five artworks; paid plans start at ₹499 a month.",
  },
] as const;

/* ── The team ──────────────────────────────────────────────────────────── */

export const team = [
  {
    initials: "KC",
    name: "Kailashpati Choudhary",
    role: "Founder and CEO",
    bio: "LLB, Rajasthan University. Corporate law, IP and regulatory compliance. Founder of Indiagrapher. DPIIT, NSWS and SISFS signatory.",
  },
  {
    initials: "SS",
    name: "Shishir Singhal",
    role: "CTO and technical lead",
    bio: "MS Computer Science, Georgia Tech (4.0). BS Aerospace, UCLA. Four years as a founding engineer at Detroit Flying Cars. AI, blockchain and NFC.",
  },
  {
    initials: "VD",
    name: "Vishnudev Choudhary",
    role: "AI and ML advisor",
    bio: "IIT Tirupati. Three years of production ML. Guides the CLIP matching, the CNN anti-fraud layer and demand-signal modelling.",
  },
  {
    initials: "SA",
    name: "Sparsh Agarwal",
    role: "HR and operations advisor",
    bio: "PGP-HRM, MDI Gurgaon. UGC-NET. Previously SECI and Tata Steel. Hiring frameworks and organisation design.",
  },
] as const;

/* ── The community ─────────────────────────────────────────────────────── */

export const community = {
  name: "Indiagrapher",
  summary:
    "A national fine-art community with active chapters across Indian cities. A weekly Artisan Spotlight, a monthly Deep Dive, and the Heritage Retreat. Every artform, every tradition.",
  rituals: [
    {
      title: "Weekly Artisan Spotlight",
      detail:
        "One artist, one practice, read properly rather than scrolled past.",
    },
    {
      title: "Monthly Deep Dive",
      detail:
        "A single artform taken apart by the people who have spent their lives inside it.",
    },
    {
      title: "Heritage Retreat",
      detail:
        "Artists, curators and conservators in one room, away from a feed.",
    },
    {
      title: "City chapters",
      detail:
        "Local groups that meet in person, because a community that only exists online is a mailing list.",
    },
  ],
  pipeline: "100 onboardings planned over the next three to six months",
} as const;

/* ── The physical wall ─────────────────────────────────────────────────── */

export const physicalWall = {
  venue: "Ric Platter Restaurant, Jaipur",
  summary:
    "Daily-rental slots. Book, hang, and be found by people who came for dinner and left thinking about a painting.",
  capabilities: [
    "Daily slot booking",
    "Exhibition scheduling",
    "Artist queue",
    "Payment and invoicing",
    "Visitor analytics",
    "NFC tags",
    "QR discovery",
    "Photo documentation",
    "Rotation management",
    "Revenue tracking",
  ],
} as const;
