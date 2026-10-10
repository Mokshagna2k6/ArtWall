import type { Metadata } from "next";

import { WallSection } from "@/features/wall/wall-section";

export const metadata: Metadata = {
  title: "The Wall",
  description:
    "One wall, one place for each artist. Claim your frame among India's founding artists on ArtWall.",
};

export default function WallPage() {
  return <WallSection />;
}
