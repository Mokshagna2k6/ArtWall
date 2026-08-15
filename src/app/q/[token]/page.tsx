import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";

import { features } from "@/config/site";
import { resolveToken } from "@/features/physical-wall/data/tokens";
import { recordScan } from "@/features/physical-wall/actions/visitor";

export const metadata: Metadata = {
  // A scan target, not a page anyone should find in search results.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The QR resolver (C06).
 *
 * Every printed code on the wall points here, and this is the whole reason the
 * URL sits at the site root rather than under /physical-wall: it gets printed
 * onto a sticker, and every character is more QR density to smudge.
 *
 * Resolving server-side — rather than encoding a destination in the code — is
 * what makes a photographed or copied label harmless. The code names a row; we
 * decide where that row sends you, and we can revoke it.
 *
 * The scan is logged *before* the redirect but is never allowed to block it:
 * `recordScan` swallows its own failures, so a wobbly database means a slower
 * analytics number and not a visitor staring at an error in a restaurant.
 */
export default async function QrResolverPage({
  params,
}: PageProps<"/q/[token]">) {
  if (!features.physicalWall) notFound();

  const { token } = await params;
  const resolved = await resolveToken(token);

  if (!resolved.ok) {
    return <UnreadableCode reason={resolved.reason} />;
  }

  const { subjectType, subjectId } = resolved.subject;

  if (subjectType === "artwork") {
    // Tie the scan to the visitor's session if they registered at the door, so
    // the Platter perk can later say which work drew them in. The cookie holds
    // an opaque visit id and nothing else.
    const visitId = (await cookies()).get("pw_visit")?.value ?? null;
    await recordScan(subjectId, visitId);
    redirect(`/physical-wall/a/${subjectId}`);
  }

  if (subjectType === "visitor" || subjectType === "artist" || subjectType === "booking") {
    // A coupon. Only staff can act on it, and the counter screen enforces that
    // — sending everyone there means a customer who scans their own code sees
    // a sign-in prompt rather than a dead end.
    redirect(`/physical-wall/ops/perk/${token}`);
  }

  return <UnreadableCode reason="unknown" />;
}

/**
 * The failure page.
 *
 * Deliberately not a 404. Someone is standing at a wall with a phone out, and
 * "this code has expired" tells them what to do next where "not found" does
 * not. It also never says *why* a code is unknown in a way that would help
 * someone probing for valid ones.
 */
function UnreadableCode({ reason }: { reason: string }) {
  const message =
    reason === "expired"
      ? "This code has expired. Coupons are good for the day they're issued."
      : reason === "revoked"
        ? "This code has been withdrawn."
        : "We can't read this code. It may be damaged, or it may not be one of ours.";

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-5 py-24 sm:px-8">
      <p className="text-signal text-eyebrow">ArtWall</p>
      <h1 className="font-heading text-display mt-4 text-balance">
        That code didn&rsquo;t open anything.
      </h1>
      <p className="text-ink-muted mt-4 text-sm leading-6">{message}</p>
      <p className="text-ink-muted mt-2 text-sm leading-6">
        If you scanned a label beside an artwork and it looks tampered with,
        please tell a member of staff.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/physical-wall"
          className="border-hairline-strong text-small hover:border-ink inline-flex h-10 items-center rounded-md border px-4"
        >
          See what&rsquo;s on the wall
        </Link>
      </div>
    </main>
  );
}
