import type { Metadata } from "next";

import { LandingPage } from "@/features/home/landing-page";

export const metadata: Metadata = {
  title: "The Platform",
  description:
    "Reimagining and revolutionising India's art economy through exhibition, trusted exchange, and lasting provenance: the six systems, the living map, and the numbers behind them.",
  alternates: { canonical: "/about/platform" },
};

/**
 * The marketing narrative that used to be the homepage.
 *
 * docs/archive/plans/CHANGES-PLAN.md §1 moves the marketplace onto "/" and keeps this page
 * reachable rather than deleting it — the six-systems argument, the living map
 * and the stats bar are what investors and press are sent to.
 *
 * It lives under /about rather than at /platform because /platform is already
 * the Services page (a different, real argument page) — see the About
 * dropdown in config/nav.ts. No redirect from "/" is added: "/" is not gone,
 * it is a different page now, and redirecting the site root would be wrong.
 */
export default function PlatformNarrativePage() {
  return <LandingPage />;
}
