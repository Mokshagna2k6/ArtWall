"use client";

import { ArrowLeft, ImagePlus } from "lucide-react";
import Link from "next/link";

import { ArtworkForm } from "@/components/dashboard/artwork-form";
import { StudioPageHeader } from "@/components/dashboard/studio-shell";

export default function NewArtworkPage() {
  return <div className="flex flex-col gap-8"><Link href="/studio/artworks" className="flex items-center gap-2 text-sm text-studio-muted hover:text-studio-ink"><ArrowLeft aria-hidden />Back to artworks</Link><StudioPageHeader eyebrow="New catalogue entry" title="Add an artwork" description="Begin with the details you know. You can return to complete the record at any time." /><div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]"><section className="studio-card flex min-h-80 flex-col items-center justify-center p-6 text-center"><div className="studio-empty-mark"><ImagePlus aria-hidden /></div><h2 className="mt-5 text-lg text-studio-ink">Image upload next</h2><p className="mt-2 max-w-xs text-sm leading-6 text-studio-muted">Cloudinary image ingestion can be connected once the catalogue record exists.</p></section><ArtworkForm /></div></div>;
}
