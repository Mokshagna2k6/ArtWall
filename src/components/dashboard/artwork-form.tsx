"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createArtwork } from "@/app/actions/artworks";

export function ArtworkForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  async function submit(formData: FormData) { setPending(true); setError(""); try { await createArtwork({ title: formData.get("title"), year: formData.get("year") || undefined, medium: formData.get("medium") || undefined, status: formData.get("status") }); router.push("/studio/artworks"); router.refresh(); } catch (err) { setError(err instanceof Error ? err.message : "Unable to save artwork"); setPending(false); } }
  return <form action={submit} className="studio-card flex flex-col gap-5 p-6 md:p-8"><div><p className="studio-eyebrow">Identity</p><h2 className="mt-2 text-2xl text-studio-ink">The work at a glance</h2></div><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Title<input className="studio-input" name="title" placeholder="Untitled" required /></label><div className="grid gap-5 md:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Year<input className="studio-input" name="year" inputMode="numeric" placeholder="2026" /></label><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Medium<input className="studio-input" name="medium" placeholder="Oil on canvas" /></label></div><label className="flex flex-col gap-2 text-sm font-medium text-studio-ink">Status<select className="studio-input" name="status" defaultValue="available"><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option></select></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<button className="studio-button" disabled={pending}>{pending ? "Saving…" : "Save artwork"}</button></form>;
}
