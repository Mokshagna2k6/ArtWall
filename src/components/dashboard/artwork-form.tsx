"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createArtwork } from "@/app/actions/artworks";
import { ImageDrop } from "@/features/upload/image-drop";

export function ArtworkForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [image, setImage] = useState<{ url: string; publicId: string } | null>(null);

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
      setError(cause instanceof Error ? cause.message : "Unable to save artwork");
      setPending(false);
    }
  }

  return <form action={submit} className="studio-card flex flex-col gap-5 p-6 md:p-8"><div><p className="studio-eyebrow">Catalogue record</p><h2 className="mt-2 text-2xl text-studio-ink">The work, in its own words</h2><p className="mt-2 text-sm leading-6 text-studio-muted">An image is optional, but adding one lets the work appear on your public profile when you publish it.</p></div><ImageDrop kind="artwork" label="Artwork image" hint="JPG, PNG, WebP or AVIF; up to 25 MB." onChange={(asset) => setImage(asset ? { url: asset.url, publicId: asset.publicId } : null)} /><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Title<input className="studio-input" name="title" placeholder="Untitled" required /></label><div className="grid gap-5 md:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Year<input className="studio-input" name="year" inputMode="numeric" placeholder="2026" /></label><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Medium<input className="studio-input" name="medium" placeholder="Oil on canvas" /></label></div><div className="grid gap-5 md:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Dimensions<input className="studio-input" name="dimensions" placeholder="91 × 122 cm" /></label><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Availability<select className="studio-input" name="status" defaultValue="available"><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option></select></label></div><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Artwork note<textarea className="studio-input min-h-28 resize-y" name="description" placeholder="A short statement, process note, or story behind this work." /></label><label className="flex items-start gap-3 rounded-xl border border-studio-border bg-studio-bg p-4 text-sm text-studio-ink"><input className="mt-0.5 size-4 accent-[var(--studio-accent)]" type="checkbox" name="isPublic" defaultChecked /><span><span className="font-medium">Show on my public ArtWall profile</span><span className="mt-1 block text-xs leading-5 text-studio-muted">You can publish the profile later; this decides whether this work appears there.</span></span></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<button className="studio-button" disabled={pending}>{pending ? "Saving…" : "Save artwork"}</button></form>;
}
