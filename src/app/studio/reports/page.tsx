import {
  StudioNotAvailable,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Professional tools"
        title="Reports"
        description="Clear views into your catalogue, activity, and the health of your practice."
      />
      <StudioNotAvailable what="Reporting" />
    </div>
  );
}
