"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setArtworkPublic } from "@/app/actions/artworks";
import {
  bindTagToArtwork,
  createTag,
  unbindTag,
} from "@/features/art-tags/actions";

type Artwork = { id: string; title: string };

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

export function CreateTagForm({ artworks }: { artworks: Artwork[] }) {
  const { pending, error, run } = useAction();
  return (
    <form
      className="studio-card flex flex-wrap items-center gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        run(async () => {
          await createTag({
            tagType: f.get("tagType") === "nfc" ? "nfc" : "qr",
            tagUid: String(f.get("tagUid")).trim(),
            artworkId: String(f.get("artworkId") || "") || undefined,
          });
          form.reset();
        }, "Could not register this tag. Is the UID already in use?");
      }}
    >
      <select name="tagType" aria-label="Tag type" className="studio-input">
        <option value="qr">QR</option>
        <option value="nfc">NFC</option>
      </select>
      <input
        name="tagUid"
        required
        maxLength={120}
        placeholder="Tag UID (printed on the tag)"
        aria-label="Tag UID"
        className="studio-input min-w-48 flex-1"
      />
      <select name="artworkId" aria-label="Bind to artwork" className="studio-input flex-1">
        <option value="">Not bound yet</option>
        {artworks.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title}
          </option>
        ))}
      </select>
      <button className="studio-button" disabled={pending}>
        {pending ? "Saving…" : "Register tag"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

export function TagRowControls({
  tagId,
  artworkId,
  artworkIsPublic,
  artworks,
}: {
  tagId: string;
  artworkId: string | null;
  artworkIsPublic: boolean | null;
  artworks: Artwork[];
}) {
  const { pending, error, run } = useAction();
  const [target, setTarget] = useState("");
  // Optimistic: the server value arrives on refresh; revert if the action fails.
  const [isPublic, setIsPublic] = useState(Boolean(artworkIsPublic));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {artworkId ? (
          <>
            <label className="text-studio-ink flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPublic}
                disabled={pending}
                onChange={(e) => {
                  const next = e.target.checked;
                  setIsPublic(next);
                  run(async () => {
                    try {
                      await setArtworkPublic(artworkId, next);
                    } catch (err) {
                      setIsPublic(!next);
                      throw err;
                    }
                  }, "Could not change visibility.");
                }}
              />
              Artwork is public (visible when scanned)
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => unbindTag(tagId), "Could not unbind.")}
              className="text-xs text-red-600 hover:underline disabled:opacity-60"
            >
              Unbind
            </button>
          </>
        ) : (
          <>
            <select
              aria-label="Bind to artwork"
              className="studio-input flex-1"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose an artwork…</option>
              {artworks.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending || !target}
              onClick={() =>
                run(() => bindTagToArtwork(tagId, target), "Could not bind.")
              }
              className="border-studio-border text-studio-ink rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Bind
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
