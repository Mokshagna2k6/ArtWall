import { FileText } from "lucide-react";
import { getDocuments } from "@/app/actions/workspaces";
import {
  StudioButton,
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";
import { WorkspaceCreateForm } from "@/components/dashboard/workspace-create-form";
export default async function DocumentsPage() {
  const items = await getDocuments();
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Archive"
        title="Documents"
        description="Keep certificates, invoices, agreements, and the supporting record close to each work."
        action={<WorkspaceCreateForm kind="document" />}
      />
      {items.length === 0 ? (
        <div className="studio-card">
          <StudioEmptyState
            title="No documents yet"
            description="Documents added to this workspace will be organized and permissioned here."
            action={
              <StudioButton>
                <FileText data-icon="inline-start" />
                Add first document
              </StudioButton>
            }
          />
        </div>
      ) : (
        <div className="studio-card divide-studio-border flex flex-col divide-y">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-5"
            >
              <p className="text-studio-ink text-sm font-medium">
                {item.title}
              </p>
              <span className="studio-eyebrow">{item.kind}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
