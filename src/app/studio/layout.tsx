import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { StudioShell } from "@/components/dashboard/studio-shell";
import { features } from "@/config/site";
import { ensureArtistProfile } from "@/lib/artist-profiles";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: { default: "Studio", template: "%s | ArtWall Studio" },
  description:
    "A considered workspace for artists to catalogue, place, and grow their practice.",
  robots: { index: false, follow: false },
};

export default async function StudioLayout({
  children,
}: LayoutProps<"/studio">) {
  // The workspace is built but not being shown yet. Gated here, at the layout,
  // so every page beneath it is covered by one check rather than eleven.
  if (!features.studio) redirect("/join");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user)
    redirect(`/sign-in?callbackUrl=${encodeURIComponent("/studio")}`);
  const profile = await ensureArtistProfile(session.user);
  return (
    <StudioShell artistName={profile.displayName} avatarUrl={profile.avatarUrl}>
      {children}
    </StudioShell>
  );
}
