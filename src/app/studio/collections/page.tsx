import { ArrowUpRight, FolderKanban, MapPin, Plus, Sparkles } from "lucide-react";

import { StudioButton, StudioPageHeader } from "@/components/dashboard/studio-shell";

const modules = [
  { title: "Collections", description: "Group works into bodies, seasons, or stories.", icon: FolderKanban },
  { title: "Exhibitions", description: "Keep upcoming shows, applications, and checklists together.", icon: Sparkles },
  { title: "Locations", description: "Know where every work is, from the studio to the wall.", icon: MapPin },
];

export default function CollectionsPage() {
  return <div className="flex flex-col gap-8"><StudioPageHeader eyebrow="Organization" title="Collections & places" description="Give your catalogue structure without forcing your practice into a template." action={<StudioButton><Plus data-icon="inline-start" />Create collection</StudioButton>} /><div className="grid gap-4 md:grid-cols-3">{modules.map(({ title, description, icon: Icon }) => <article key={title} className="studio-card flex min-h-56 flex-col p-6"><Icon className="text-studio-accent" aria-hidden /><h2 className="mt-auto text-xl text-studio-ink">{title}</h2><p className="mt-2 text-sm leading-6 text-studio-muted">{description}</p><button className="mt-5 flex items-center gap-2 text-sm font-medium text-studio-ink">Open module <ArrowUpRight aria-hidden /></button></article>)}</div></div>;
}
