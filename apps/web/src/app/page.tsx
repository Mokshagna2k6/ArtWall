import type { Metadata } from "next";

import { MarketplaceHome } from "@/features/home/marketplace-home";
import { getActor } from "@/features/physical-wall/authorize";

export const metadata: Metadata = {
  title: "ArtWall | Buy original art from India's artists",
  description:
    "Browse and buy original paintings, prints, photography and sculpture direct from India's contemporary artists. Every work carries its own provenance record.",
  alternates: { canonical: "/" },
};

/**
 * The homepage is the marketplace (docs/archive/plans/CHANGES-PLAN.md §1). The marketing
 * narrative it replaced still exists, at /about/platform.
 *
 * The session is read here, once, and handed down: the buy/save controls need
 * to know whether to act or to link to sign-in, and the layout already reads
 * the session for the header, so this costs nothing extra. Browsing is never
 * gated — see features/home/listing-actions.tsx.
 */
export default async function HomePage() {
  const user = await getActor();
  return <MarketplaceHome signedIn={user != null} />;
}
