import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { features } from "@/config/site";

export const metadata: Metadata = {
  title: { default: "The Wall at Ric Platter", template: "%s | ArtWall" },
  description:
    "Real art on a real wall, in a room where people eat. Book a slot, or scan a code and meet the artist.",
};

/**
 * Everything under /physical-wall.
 *
 * The feature gate lives here rather than on each page, so one check covers a
 * dozen routes and none of them can be forgotten. `notFound()` rather than a
 * redirect: while the venue is not open, this software should be invisible,
 * not merely inaccessible.
 */
export default function PhysicalWallLayout({
  children,
}: LayoutProps<"/physical-wall">) {
  if (!features.physicalWall) notFound();
  return children;
}
