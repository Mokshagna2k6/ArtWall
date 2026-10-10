import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { StudioShell } from "@/components/dashboard/studio-shell";
import { features } from "@/config/site";
import { ensureArtistProfile } from "@/lib/artist-profiles";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { user as userTable } from "@/lib/db/schema";

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

  // Only the FIRST-EVER accidental auto-creation is the bug: a user who has
  // never answered "What brings you to ArtWall?" (onboardingPersona still
  // null) must not get a silent artist_profiles row just by navigating here.
  // Once answered, personas aren't mutually exclusive lifetime labels - a
  // buyer or curator who later deliberately visits /studio to become an
  // artist too is let straight through, same as today.
  const [row] = await db
    .select({ onboardingPersona: userTable.onboardingPersona })
    .from(userTable)
    .where(eq(userTable.id, session.user.id));
  if (!row?.onboardingPersona) redirect("/welcome");

  const profile = await ensureArtistProfile(session.user);
  return (
    <StudioShell artistName={profile.displayName} avatarUrl={profile.avatarUrl}>
      {children}
    </StudioShell>
  );
}
