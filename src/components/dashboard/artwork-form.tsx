"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createArtwork } from "@/app/actions/artworks";
import { ImageDrop } from "@/features/upload/image-drop";

export function ArtworkForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [image, setImage] = useState<{ url: string; publicId: string } | null>(
    null
  );

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    try {
      await createArtwork({
        title: formData.get("title"),
        year: formData.get("year") || undefined,
        medium: formData.get("medium"),
        description: formData.get("description"),
        dimensions: formData.get("dimensions"),
        status: formData.get("status"),
        isPublic: formData.get("isPublic") === "on",
        imageUrl: image?.url,
        imagePublicId: image?.publicId,
      });
      router.push("/studio/artworks");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save artwork"
      );
      setPending(false);
    }
  }

  return (
    <form
      action={submit}
      className="studio-card flex flex-col gap-5 p-6 md:p-8"
    >
      <div>
        <p className="studio-eyebrow">Catalogue record</p>
        <h2 className="text-studio-ink text-subsection mt-2">
          The work, in its own words
        </h2>
        <p className="text-studio-muted mt-2 text-sm leading-6">
          An image is optional, but adding one lets the work appear on your
          public profile when you publish it.
        </p>
      </div>
      <ImageDrop
        kind="artwork"
        label="Artwork image"
        hint="JPG, PNG, WebP or AVIF; up to 25 MB."
        onChange={(asset) =>
          setImage(asset ? { url: asset.url, publicId: asset.publicId } : null)
        }
      />
      <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
        Title
        <input
          className="studio-input"
          name="title"
          placeholder="Untitled"
          required
        />
      </label>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
          Year
          <input
            className="studio-input"
            name="year"
            inputMode="numeric"
            placeholder="2026"
          />
        </label>
        <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
          Medium
          <input
            className="studio-input"
            name="medium"
            placeholder="Oil on canvas"
          />
        </label>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
          Dimensions
          <input
            className="studio-input"
            name="dimensions"
            placeholder="91 × 122 cm"
          />
        </label>
        <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
          Availability
          <select
            className="studio-input"
            name="status"
            defaultValue="available"
          >
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="sold">Sold</option>
          </select>
        </label>
      </div>
      <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
        Artwork note
        <textarea
          className="studio-input min-h-28 resize-y"
          name="description"
          placeholder="A short statement, process note, or story behind this work."
        />
      </label>
      <label className="border-studio-border bg-studio-bg text-studio-ink flex items-start gap-3 rounded-xl border p-4 text-sm">
        <input
          className="mt-0.5 size-4 accent-[var(--studio-accent)]"
          type="checkbox"
          name="isPublic"
          defaultChecked
        />
        <span>
          <span className="font-medium">Show on my public ArtWall profile</span>
          <span className="text-studio-muted mt-1 block text-xs leading-5">
            You can publish the profile later; this decides whether this work
            appears there.
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <button className="studio-button" disabled={pending}>
        {pending ? "Saving…" : "Save artwork"}
      </button>
    </form>
  );
}
