import type { Metadata } from "next";

import { StudioShell } from "@/components/dashboard/studio-shell";

export const metadata: Metadata = {
  title: { default: "Studio", template: "%s — ArtWall Studio" },
  description: "A considered workspace for artists to catalogue, place, and grow their practice.",
};

export default function StudioLayout({ children }: LayoutProps<"/studio">) {
  return <StudioShell>{children}</StudioShell>;
}
