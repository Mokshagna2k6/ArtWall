import {
  StudioNotAvailable,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";

export default function CalendarPage() {
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Operations"
        title="Calendar"
        description="Exhibitions, studio visits, deadlines, and the moments that move a practice forward."
      />
      <StudioNotAvailable what="The studio calendar" />
    </div>
  );
}
