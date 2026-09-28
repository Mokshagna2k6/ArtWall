import { getTasks } from "@/app/actions/organization";
import {
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";
export default async function TasksPage() {
  const tasks = await getTasks();
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Operations"
        title="Tasks"
        description="Keep the small, consequential work of a practice moving."
      />
      {tasks.length === 0 ? (
        <div className="studio-card">
          <StudioEmptyState
            title="No open tasks"
            description="Creating tasks from the studio is not yet available. Tasks recorded for you will be listed here."
          />
        </div>
      ) : (
        <div className="studio-card divide-studio-border flex flex-col divide-y">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-4 p-5"
            >
              <p className="text-studio-ink text-sm font-medium">
                {task.title}
              </p>
              <span className="studio-eyebrow">{task.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
