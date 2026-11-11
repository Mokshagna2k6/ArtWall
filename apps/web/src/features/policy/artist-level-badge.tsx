import { Check, Minus } from "lucide-react";

import type { ArtistLevelSummary } from "@/features/policy/artist-level";

/**
 * The Bible §4 A0-A4 summary, for a public artist profile.
 *
 * Sits BESIDE the per-dimension displays (VerificationPanel's peer/curator
 * endorsements, the identity line), never instead of them — §3 forbids one
 * generic "Verified" standing in for the dimensions. So the badge always
 * shows the rungs it is made of, and says in words what it does not cover
 * (§5: an artist's level says nothing about any individual artwork).
 *
 * No interactivity, so no "use client" — it renders inside the server page.
 */
export function ArtistLevelBadge({
  summary,
  artistName,
}: {
  summary: ArtistLevelSummary;
  artistName: string;
}) {
  const rungs = [
    { name: "Identity checked", done: summary.identity },
    { name: "Portfolio reviewed", done: summary.portfolio },
    { name: "Peer endorsed", done: summary.peer },
    { name: "Curator reviewed", done: summary.curator },
  ];

  return (
    <section className="border-border rounded border p-5" aria-label="Artist verification level">
      <div className="flex items-baseline gap-3">
        <span className="font-heading text-lg tabular-nums">{summary.level}</span>
        <h2 className="text-sm font-medium">{summary.label}</h2>
      </div>

      <ul className="mt-3 space-y-1.5">
        {rungs.map((rung) => (
          <li key={rung.name} className="flex items-center gap-2 text-sm">
            {rung.done ? (
              <Check aria-hidden className="size-4 shrink-0 text-[#e0703a]" />
            ) : (
              <Minus aria-hidden className="text-ink-muted size-4 shrink-0 opacity-40" />
            )}
            <span className={rung.done ? undefined : "text-ink-muted"}>{rung.name}</span>
            <span className="sr-only">{rung.done ? "complete" : "not complete"}</span>
          </li>
        ))}
      </ul>

      {summary.nextStep && (
        <p className="text-ink-muted mt-3 text-xs leading-5">Next step: {summary.nextStep}.</p>
      )}

      {/* Bible §5 — this level is about the artist, never about the work. */}
      <p className="text-ink-muted mt-2 text-xs leading-5">
        A summary of {artistName}&rsquo;s own verification steps. It does not mean any
        individual artwork is documented, authenticated or blockchain-verified — each work
        carries its own certificate, provenance and binding status.
      </p>
    </section>
  );
}
