"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createArtwork } from "@/app/actions/artworks";
import { FieldError, fieldProps } from "@/components/dashboard/field-error";
import {
  ARTWORK_CATEGORIES,
  ARTWORK_MEDIUMS,
  categoryLabel,
} from "@/features/marketplace/categories";
import { ImageDrop } from "@/features/upload/image-drop";
import type { FieldErrors } from "@/lib/form-result";

export function ArtworkForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [image, setImage] = useState<{ url: string; publicId: string } | null>(
    null
  );
  // Width/height are two inputs but one stored `dimensions` string.
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    setFieldErrors({});
    try {
      const result = await createArtwork({
        title: formData.get("title"),
        year: formData.get("year") || undefined,
        medium: formData.get("medium"),
        description: formData.get("description"),
        dimensions: formData.get("dimensions"),
        status: formData.get("status"),
        category: formData.get("category") ?? undefined,
        price: formData.get("price") ?? undefined,
        isPublic: formData.get("isPublic") === "on",
        imageUrl: image?.url,
        imagePublicId: image?.publicId,
      });
      if (!result.ok) {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        setPending(false);
        return;
      }
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
      <FieldError errors={fieldErrors} name="imageUrl" />
      <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
        Title
        <input
          className="studio-input"
          {...fieldProps(fieldErrors, "title")}
          placeholder="Untitled"
          required
        />
        <FieldError errors={fieldErrors} name="title" />
      </label>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
          Year *
          {/* number, not free text: the action already coerces to int 1000-3000,
              so a typed word was only ever rejected after a round trip. */}
          <input
            className="studio-input"
            {...fieldProps(fieldErrors, "year")}
            type="number"
            min={1000}
            max={3000}
            step={1}
            required
            placeholder="2026"
          />
          <FieldError errors={fieldErrors} name="year" />
        </label>
        <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
          Medium *
          {/* datalist, not <select>: the medium list is a strong suggestion, and
              a practice we have not listed must still be typeable. */}
          <input
            className="studio-input"
            {...fieldProps(fieldErrors, "medium")}
            list="artwork-medium-options"
            required
            placeholder="Oil on canvas"
          />
          <datalist id="artwork-medium-options">
            {ARTWORK_MEDIUMS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <FieldError errors={fieldErrors} name="medium" />
        </label>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
          Dimensions (cm) *
          {/* Two numbers, one stored string: the action still receives the
              `dimensions` text it has always parsed, so nothing server-side
              or in the DB changes. */}
          <span className="flex items-center gap-2">
            <input
              className="studio-input w-full"
              name="widthCm"
              type="number"
              min={1}
              step={1}
              required
              value={width}
              aria-label="Width in centimetres"
              placeholder="91"
              onChange={(e) => setWidth(e.target.value)}
            />
            <span aria-hidden className="text-studio-muted">×</span>
            <input
              className="studio-input w-full"
              name="heightCm"
              type="number"
              min={1}
              step={1}
              required
              value={height}
              aria-label="Height in centimetres"
              placeholder="122"
              onChange={(e) => setHeight(e.target.value)}
            />
          </span>
          <input
            type="hidden"
            name="dimensions"
            value={width && height ? `${width} x ${height} cm` : ""}
          />
          <FieldError errors={fieldErrors} name="dimensions" />
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
        Category
        <select className="studio-input" name="category" defaultValue="">
          <option value="">Not set</option>
          {ARTWORK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
        Price (₹) *
        <input
          className="studio-input"
          {...fieldProps(fieldErrors, "price")}
          type="number"
          min={0}
          max={20000000}
          step="any"
          required
          placeholder="10000"
        />
        <FieldError errors={fieldErrors} name="price" />
      </label>
      <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
        Artwork note
        <textarea
          className="studio-input min-h-28 resize-y"
          {...fieldProps(fieldErrors, "description")}
          placeholder="A short statement, process note, or story behind this work."
        />
        <FieldError errors={fieldErrors} name="description" />
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
