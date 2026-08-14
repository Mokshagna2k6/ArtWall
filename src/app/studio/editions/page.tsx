import {
  StudioEmptyState,
  StudioPageHeader,
  StudioButton,
} from "@/components/dashboard/studio-shell";
export default function EditionsPage() {
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Organization"
        title="Editions"
        description="Track edition sizes, numbering, and availability without losing the story behind the work."
        action={<StudioButton>Create edition</StudioButton>}
      />
      <div className="studio-card">
        <StudioEmptyState
          title="No editions yet"
          description="Edition records will appear here once you add a reproducible body of work."
        />
      </div>
    </div>
  );
}
