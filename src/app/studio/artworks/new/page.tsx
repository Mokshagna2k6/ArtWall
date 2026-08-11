import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { ArtworkForm } from "@/components/dashboard/artwork-form";
import { StudioPageHeader } from "@/components/dashboard/studio-shell";

export default function NewArtworkPage() {
  return <div className="mx-auto flex max-w-3xl flex-col gap-8"><Link href="/studio/artworks" className="flex items-center gap-2 text-sm text-studio-muted hover:text-studio-ink"><ArrowLeft aria-hidden />Back to artworks</Link><StudioPageHeader eyebrow="New catalogue entry" title="Add an artwork" description="Capture the image, material, dimensions and context now. It remains private until you decide your profile is ready to publish." /><ArtworkForm /></div>;
}
