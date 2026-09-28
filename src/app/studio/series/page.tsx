import {
  StudioNotAvailable,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";

export default function SeriesPage() {
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Organization"
        title="Series"
        description="Group related works into bodies of practice with their own context."
      />
      <StudioNotAvailable what="Series" />
    </div>
  );
}
