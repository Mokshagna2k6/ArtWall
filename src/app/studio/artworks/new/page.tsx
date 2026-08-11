"use client";

import { ArrowLeft, ImagePlus, Save } from "lucide-react";
import Link from "next/link";

import { StudioButton, StudioPageHeader } from "@/components/dashboard/studio-shell";

export default function NewArtworkPage() {
  return <div className="flex flex-col gap-8">
    <Link href="/studio/artworks" className="flex items-center gap-2 text-sm text-studio-muted hover:text-studio-ink"><ArrowLeft aria-hidden />Back to artworks</Link>
    <StudioPageHeader eyebrow="New catalogue entry" title="Add an artwork" description="Begin with the details you know. You can return to complete the record at any time." action={<StudioButton><Save data-icon="inline-start" />Save draft</StudioButton>} />
    <form className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
      <section className="studio-card flex min-h-80 flex-col items-center justify-center p-6 text-center"><div className="studio-empty-mark"><ImagePlus aria-hidden /></div><h2 className="mt-5 text-lg text-studio-ink">Add primary image</h2><p className="mt-2 max-w-xs text-sm leading-6 text-studio-muted">A clear image gives the archive its first point of reference.</p><button type="button" className="studio-button mt-5">Choose image</button></section>
      <section className="studio-card flex flex-col gap-5 p-6 md:p-8"><div><p className="studio-eyebrow">Identity</p><h2 className="mt-2 text-2xl text-studio-ink">The work at a glance</h2></div><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Title<input className="studio-input" placeholder="Untitled" /></label><div className="grid gap-5 md:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Year<input className="studio-input" placeholder="2026" /></label><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Catalogue number<input className="studio-input" placeholder="AW-0001" /></label></div><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Medium<input className="studio-input" placeholder="Oil on canvas" /></label><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Description<textarea className="studio-input min-h-28" placeholder="What should the record remember about this work?" /></label></section>
    </form>
  </div>;
}
