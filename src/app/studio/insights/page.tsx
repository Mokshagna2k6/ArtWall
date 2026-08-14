import {
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";
export default function InsightsPage() {
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Professional tools"
        title="Insights"
        description="Understand your archive through transparent, database-backed activity rather than invented metrics."
      />
      <div className="studio-card">
        <StudioEmptyState
          title="Insights will grow with your archive"
          description="Once artworks, contacts, and sales have history, this view will surface useful patterns."
        />
      </div>
    </div>
  );
}
