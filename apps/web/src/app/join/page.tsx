import type { Metadata } from "next";

import { JoinSection } from "@/features/waitlist/join-section";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Join the Wall",
  description:
    "Take a numbered place among India's founding artists on ArtWall. Founding Membership is optional, and open to the first five hundred who want it.",
  robots: { index: true, follow: true },
};

/**
 * Join the Wall.
 *
 * Signed-in only. A place on the wall is tied to a person, so the page sends
 * anyone without a session to sign in and brings them straight back. The
 * Server Action behind the form repeats the check, because a page-level
 * redirect is a courtesy and not a control.
 */
export default async function JoinPage() {
  const user = await requireUser("/join");

  return <JoinSection user={user} />;
}
