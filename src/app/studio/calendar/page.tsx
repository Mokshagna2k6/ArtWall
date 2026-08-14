import { CalendarDays, Plus } from "lucide-react";
import {
  StudioButton,
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";
export default function CalendarPage() {
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Operations"
        title="Calendar"
        description="Exhibitions, studio visits, deadlines, and the moments that move a practice forward."
        action={
          <StudioButton>
            <Plus data-icon="inline-start" />
            Add event
          </StudioButton>
        }
      />
      <div className="studio-card">
        <StudioEmptyState
          title="Nothing on the calendar"
          description="Add an event when the next important date appears. Your week will take shape here."
          action={
            <StudioButton>
              <CalendarDays data-icon="inline-start" />
              Add first event
            </StudioButton>
          }
        />
      </div>
    </div>
  );
}
