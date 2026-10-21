"use client";

import { useState, useTransition } from "react";

import { purgeShowcaseData, type ShowcaseCounts } from "@/features/admin/showcase";

/**
 * Super Admin control for removing the showcase catalogue.
 *
 * Deliberately two-step: deleting a hundred artists is not something to do by
 * brushing a button, and the confirmation names the exact counts so the person
 * clicking can see what is about to go. There is no undo — re-seeding creates
 * new rows with new ids, not the same ones.
 */
export function ShowcasePanel({ initial }: { initial: ShowcaseCounts }) {
  const [counts, setCounts] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const empty = counts.artists === 0 && counts.artworks === 0;

  function remove() {
    startTransition(async () => {
      const result = await purgeShowcaseData();
      setConfirming(false);

      if (result.ok) {
        setFailed(false);
        setCounts({ artists: 0, artworks: 0 });
        setMessage(
          `Removed ${result.data.artists} showcase artists and ${result.data.artworks} artworks. Real artists are untouched.`
        );
      } else {
        setFailed(true);
        setMessage(result.error);
      }
    });
  }

  return (
    <div className="border-border flex flex-col gap-4 border bg-white p-5">
      <div>
        <h2 className="font-heading text-lg">Showcase catalogue</h2>
        <p className="text-ink-muted mt-1 text-sm">
          {empty ? (
            "No showcase data is loaded. The site is showing only real artists."
          ) : (
            <>
              <strong className="text-foreground">{counts.artists}</strong> demonstration
              artists and <strong className="text-foreground">{counts.artworks}</strong>{" "}
              artworks are live on the site. They exist so a first-time visitor sees a
              full catalogue rather than an empty page.
            </>
          )}
        </p>
      </div>

      {!empty && (
        <p className="text-ink-muted border-border border-l-2 pl-3 text-xs leading-5">
          Only rows created by the showcase seed are removed — they carry a
          reserved id prefix, so this cannot delete a real artist&rsquo;s work
          even if one is named similarly. The accounts behind these artists are
          deleted too. This cannot be undone.
        </p>
      )}

      {message && (
        <p
          role="status"
          className={`text-sm leading-6 ${failed ? "text-destructive" : "text-foreground"}`}
        >
          {message}
        </p>
      )}

      {!empty &&
        (confirming ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-foreground text-sm">
              Delete {counts.artists} artists and {counts.artworks} artworks?
            </span>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="bg-destructive inline-flex h-10 items-center justify-center px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Yes, delete it all"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="border-border hover:border-foreground inline-flex h-10 items-center justify-center border px-4 text-sm disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setConfirming(true);
            }}
            className="border-border hover:border-foreground inline-flex h-10 w-fit items-center justify-center border px-4 text-sm font-medium"
          >
            Delete dummy data
          </button>
        ))}
    </div>
  );
}
