"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addArtworkToExhibition,
  createExhibition,
  publishExhibition,
} from "@/features/exhibitions/actions";
import type { Decision } from "@/features/policy/engine";
import { REASON_COPY } from "@/features/policy/reason-codes";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, fallback: string) => {
    setError(null);
    start(async () => {
      try {
        const result = await fn();
        if (!result.ok) return setError(result.error || fallback);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : fallback);
      }
    });
  };
  return { pending, error, run };
}

export function CreateExhibitionForm() {
  const { pending, error, run } = useAction();
  return (
    <form
      className="studio-card flex flex-wrap items-end gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const form = e.currentTarget;
        run(async () => {
          const result = await createExhibition({
            title: String(f.get("title")),
            venue: String(f.get("venue") || "") || undefined,
            startDate: String(f.get("startDate") || "") || undefined,
            endDate: String(f.get("endDate") || "") || undefined,
          });
          if (result.ok) form.reset();
          return result;
        }, "Could not create the exhibition.");
      }}
    >
      <input
        name="title"
        required
        maxLength={160}
        placeholder="Exhibition title"
        aria-label="Exhibition title"
        className="studio-input min-w-48 flex-1"
      />
      <input
        name="venue"
        placeholder="Venue (optional)"
        aria-label="Venue"
        className="studio-input min-w-40 flex-1"
      />
      <input name="startDate" type="date" aria-label="Start date" className="studio-input" />
      <input name="endDate" type="date" aria-label="End date" className="studio-input" />
      <button className="studio-button" disabled={pending}>
        {pending ? "Creating…" : "Create exhibition"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

export function ExhibitionControls({
  exhibitionId,
  status,
  artworks,
  memberArtworks = [],
  eligibility = {},
}: {
  exhibitionId: string;
  status: string;
  /** The artist's works not yet in this exhibition. */
  artworks: { id: string; title: string }[];
  /** Works already added to this exhibition. */
  memberArtworks?: { id: string; title: string }[];
  /** FE-3.05/3.11: the real `canExhibit` decision per member artwork, fetched
   *  from the server — never computed here. */
  eligibility?: Record<string, Decision>;
}) {
  const { pending, error, run } = useAction();
  const [artworkId, setArtworkId] = useState("");
  const notEligible = memberArtworks.filter((a) => eligibility[a.id] && !eligibility[a.id].allow);
  return (
    <div className="mt-4 flex flex-col gap-3">
      {/* FE-3.05/3.11: why an artwork isn't exhibitable yet (binding missing,
          provenance missing), from the real PolicyEngine reason codes. */}
      {notEligible.length > 0 && (
        <div className="border-studio-border rounded-xl border border-dashed p-3">
          <p className="text-studio-muted text-xs font-medium">
            Not eligible to exhibit yet
          </p>
          <ul className="text-studio-muted mt-1.5 flex flex-col gap-1 text-xs">
            {notEligible.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.title}</span>:{" "}
                {eligibility[a.id].reasons.map((r) => REASON_COPY[r]).join(" ")}
              </li>
            ))}
          </ul>
        </div>
      )}
      {artworks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Add an artwork"
            className="studio-input flex-1"
            value={artworkId}
            onChange={(e) => setArtworkId(e.target.value)}
          >
            <option value="">Add an artwork…</option>
            {artworks.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="border-studio-border text-studio-ink rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-60"
            disabled={pending || !artworkId}
            onClick={() =>
              run(async () => {
                const result = await addArtworkToExhibition(exhibitionId, artworkId);
                if (result.ok) setArtworkId("");
                return result;
              }, "Could not add that artwork.")
            }
          >
            Add
          </button>
        </div>
      )}
      {status === "draft" && (
        <button
          type="button"
          className="studio-button self-start"
          disabled={pending || notEligible.length > 0}
          title={
            notEligible.length > 0
              ? "Resolve the eligibility issues above before publishing."
              : undefined
          }
          onClick={() =>
            run(() => publishExhibition(exhibitionId), "Could not publish.")
          }
        >
          {pending ? "Working…" : "Publish"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
