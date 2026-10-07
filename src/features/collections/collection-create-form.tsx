"use client";

import { useState, useTransition } from "react";

import { createCollection } from "@/features/collections/actions";
import type { CollectionType } from "@/features/collections/policy";

/**
 * Create-collection form. `availableTypes` is computed server-side from the
 * viewer's actual role/profile (see studio/collections/page.tsx) — the type
 * picker only ever offers types the viewer could legitimately create, but the
 * server action re-checks eligibility anyway (never trust the client).
 */
export function CollectionCreateForm({ availableTypes }: { availableTypes: CollectionType[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<CollectionType>(availableTypes[0] ?? "BUYER");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await createCollection({ type, title });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTitle("");
      setOpen(false);
    });
  }

  return open ? (
    <form onSubmit={submit} className="studio-card flex flex-wrap items-center gap-3 p-4">
      {availableTypes.length > 1 && (
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CollectionType)}
          className="studio-input"
          aria-label="Collection type"
        >
          {availableTypes.map((t) => (
            <option key={t} value={t}>
              {t === "BUYER" ? "Personal" : t === "ARTIST" ? "Artist portfolio" : "Curator"}
            </option>
          ))}
        </select>
      )}
      <input
        autoFocus
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="studio-input flex-1"
        placeholder="Collection title"
        aria-label="Collection title"
      />
      <button disabled={pending} className="studio-button">
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="studio-icon-button" aria-label="Cancel">
        ×
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="studio-button">
      New collection
    </button>
  );
}
