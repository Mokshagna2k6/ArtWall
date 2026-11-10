"use client";

import { BadgeCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { endorseArtist, withdrawEndorsement, type ArtistVerification } from "./endorsements";

/**
 * Peer / curator verification on an artist's public profile.
 *
 * Deliberately worded so it can never be mistaken for ArtWall having checked
 * this artist's identity documents — that is a separate axis
 * (`user.identityVerified`) shown elsewhere on the page. This badge says only
 * that named people in the community vouched, and it names them.
 */
export function VerificationPanel({
  artistId,
  artistName,
  verification,
  signedIn,
  returnTo,
}: {
  artistId: string;
  artistName: string;
  verification: ArtistVerification;
  signedIn: boolean;
  returnTo: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { status, peerCount, curatorCount, endorsements, viewerHasEndorsed, viewerCanEndorse } =
    verification;

  function toggleEndorsement() {
    if (!signedIn) {
      router.push(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    startTransition(async () => {
      const result = viewerHasEndorsed
        ? await withdrawEndorsement(artistId)
        : await endorseArtist({ artistId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <section className="border-border rounded border p-5" aria-label="Community verification">
      <div className="flex items-start gap-3">
        {status === "curator_verified" ? (
          <BadgeCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-[#e0703a]" />
        ) : status === "peer_verified" ? (
          <Users aria-hidden className="text-ink-muted mt-0.5 size-5 shrink-0" />
        ) : (
          <Users aria-hidden className="text-ink-muted mt-0.5 size-5 shrink-0 opacity-40" />
        )}

        <div className="flex-1">
          <h2 className="text-sm font-medium">
            {status === "curator_verified"
              ? "Curator verified"
              : status === "peer_verified"
                ? "Peer verified"
                : "Not yet community verified"}
          </h2>

          <p className="text-ink-muted mt-1 text-sm leading-6">
            {status === "curator_verified"
              ? `An ArtWall curator has vouched for ${artistName}.`
              : status === "peer_verified"
                ? `${peerCount} fellow artists have vouched for ${artistName}.`
                : verification.peersNeeded > 0
                  ? `${verification.peersNeeded} more peer ${
                      verification.peersNeeded === 1 ? "endorsement" : "endorsements"
                    } needed.`
                  : "No endorsements yet."}
          </p>

          {/* Never let this be read as an identity check. */}
          <p className="text-ink-muted mt-2 text-xs leading-5">
            Community endorsement reflects other artists and curators vouching for this
            work. It is separate from ArtWall&rsquo;s own identity checks.
          </p>

          {(peerCount > 0 || curatorCount > 0) && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {endorsements.slice(0, 8).map((endorsement) => (
                <li
                  key={endorsement.id}
                  className="border-border rounded-full border px-3 py-1 text-xs"
                  title={endorsement.note ?? undefined}
                >
                  {endorsement.endorserName}
                  {endorsement.kind === "curator" && (
                    <span className="text-[#e0703a]"> · curator</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* The button appears only for someone actually entitled to endorse. */}
          {(viewerCanEndorse || viewerHasEndorsed) && (
            <button
              type="button"
              onClick={toggleEndorsement}
              disabled={pending}
              className="border-border hover:border-ink mt-4 rounded-full border px-4 py-1.5 text-sm disabled:opacity-40"
            >
              {pending
                ? "Saving…"
                : viewerHasEndorsed
                  ? "Withdraw endorsement"
                  : `Endorse ${artistName}`}
            </button>
          )}

          {error && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
