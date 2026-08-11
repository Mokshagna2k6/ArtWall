import { ArrowUpRight, Plus, Sparkles } from "lucide-react";

import { StudioButton, StudioEmptyState, StudioMetric, StudioPageHeader } from "@/components/dashboard/studio-shell";

const activity = [
  { title: "Studio workspace created", detail: "Your catalogue is ready for its first work.", date: "Today" },
  { title: "Public profile reserved", detail: "Your artist profile will appear here when published.", date: "Today" },
];

export default function StudioOverviewPage() {
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Monday, 11 August 2026"
        title="Good morning, Aarav."
        description="A quiet place to keep the shape of your practice in view. Start with your first work, then let the archive grow with you."
        action={<StudioButton href="/studio/artworks/new"><Plus data-icon="inline-start" />Add artwork</StudioButton>}
      />

      <section aria-label="Studio summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StudioMetric label="Catalogue" value="0 works" detail="Your archive begins here" />
        <StudioMetric label="Available" value="—" detail="No works marked available" />
        <StudioMetric label="Exhibitions" value="0" detail="No upcoming exhibitions" />
        <StudioMetric label="Contacts" value="0" detail="Your collector book is empty" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="studio-card p-6 md:p-8">
          <div className="flex items-start justify-between gap-4"><div><p className="studio-eyebrow">Your archive</p><h2 className="mt-2 text-2xl text-studio-ink">Make the first mark</h2></div><Sparkles className="text-studio-accent" aria-hidden /></div>
          <StudioEmptyState title="No artworks yet" description="Add a work to begin building the living record of your practice — images, materials, provenance, and its next place." action={<StudioButton href="/studio/artworks/new">Add your first artwork <ArrowUpRight data-icon="inline-end" /></StudioButton>} />
        </div>
        <div className="studio-card p-6 md:p-8"><div className="flex items-end justify-between gap-4"><div><p className="studio-eyebrow">Recent activity</p><h2 className="mt-2 text-2xl text-studio-ink">The paper trail</h2></div><span className="text-xs text-studio-muted">Last 30 days</span></div><div className="mt-7 flex flex-col gap-5">{activity.map((item) => <div key={item.title} className="flex gap-3 border-b border-studio-border pb-5 last:border-0 last:pb-0"><span className="mt-1 size-2 shrink-0 rounded-full bg-studio-accent" aria-hidden /><div className="min-w-0"><p className="text-sm font-medium text-studio-ink">{item.title}</p><p className="mt-1 text-xs leading-5 text-studio-muted">{item.detail}</p></div><time className="ml-auto shrink-0 text-xs text-studio-muted">{item.date}</time></div>)}</div></div>
      </section>

      <section className="studio-note"><p className="studio-eyebrow">A note from the studio</p><p className="mt-3 max-w-2xl font-heading text-xl leading-8 text-studio-ink">The best catalogues are not just records of what exists. They are a way of noticing what is becoming.</p></section>
    </div>
  );
}
