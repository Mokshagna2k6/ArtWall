import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { StudioShell } from "@/components/dashboard/studio-shell";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Studio", template: "%s — ArtWall Studio" }, description: "A considered workspace for artists to catalogue, place, and grow their practice." };

export default async function StudioLayout({ children }: LayoutProps<"/studio">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect(`/sign-in?callbackUrl=${encodeURIComponent("/studio")}`);
  return <StudioShell>{children}</StudioShell>;
}
