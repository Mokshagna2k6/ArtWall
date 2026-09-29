"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addArtworkToExhibition,
  createExhibition,
  publishExhibition,
} from "@/features/exhibitions/actions";
import type { FieldErrors } from "@/lib/form-result";

import { FieldError, fieldProps } from "./field-error";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, fallback: string) => {
    setError(null);
    start(async () => {
      try {
        await fn();
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  return (
    <form
      className="studio-card flex flex-wrap items-end gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const form = e.currentTarget;
        setFieldErrors(undefined);
        run(async () => {
          const result = await createExhibition({
            title: String(f.get("title")),
            venue: String(f.get("venue") || "") || undefined,
            startDate: String(f.get("startDate") || "") || undefined,
            endDate: String(f.get("endDate") || "") || undefined,
          });
          if (!result.ok) {
            setFieldErrors(result.fieldErrors);
            throw new Error(result.message);
          }
          form.reset();
        }, "Could not create the exhibition.");
      }}
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1">
        <input
          {...fieldProps(fieldErrors, "title")}
          required
          maxLength={160}
          placeholder="Exhibition title"
          aria-label="Exhibition title"
          className="studio-input"
        />
        <FieldError errors={fieldErrors} name="title" />
      </label>
      <label className="flex min-w-40 flex-1 flex-col gap-1">
        <input
          {...fieldProps(fieldErrors, "venue")}
          placeholder="Venue (optional)"
          aria-label="Venue"
          className="studio-input"
        />
        <FieldError errors={fieldErrors} name="venue" />
      </label>
      <label className="flex flex-col gap-1">
        <input
          {...fieldProps(fieldErrors, "startDate")}
          type="date"
          aria-label="Start date"
          className="studio-input"
        />
        <FieldError errors={fieldErrors} name="startDate" />
      </label>
      <label className="flex flex-col gap-1">
        <input
          {...fieldProps(fieldErrors, "endDate")}
          type="date"
          aria-label="End date"
          className="studio-input"
        />
        <FieldError errors={fieldErrors} name="endDate" />
      </label>
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
}: {
  exhibitionId: string;
  status: string;
  /** The artist's works not yet in this exhibition. */
  artworks: { id: string; title: string }[];
}) {
  const { pending, error, run } = useAction();
  const [artworkId, setArtworkId] = useState("");
  return (
    <div className="mt-4 flex flex-col gap-3">
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
                await addArtworkToExhibition(exhibitionId, artworkId);
                setArtworkId("");
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
          disabled={pending}
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
