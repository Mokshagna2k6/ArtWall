import {
  StudioNotAvailable,
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
      <StudioNotAvailable what="Insights" />
    </div>
  );
}
