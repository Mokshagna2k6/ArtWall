import type { Metadata } from "next";

import { LandingPage } from "@/features/home/landing-page";

export const metadata: Metadata = {
  title: "ArtWall Labs | Art lives on the wall.",
  description:
    "Reimagining and revolutionising India's art economy through exhibition, trusted exchange, and lasting provenance.",
};

export default function HomePage() {
  return <LandingPage />;
}
