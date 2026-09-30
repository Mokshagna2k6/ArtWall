import { getCollections } from "@/app/actions/organization";
import {
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";
import { WorkspaceCreateForm } from "@/components/dashboard/workspace-create-form";

export default async function CollectionsPage() {
  const collections = await getCollections();
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Organization"
        title="Collections & places"
        description="Give your catalogue structure without forcing your practice into a template."
        action={<WorkspaceCreateForm kind="collection" />}
      />
      {collections.length === 0 ? (
        <div className="studio-card">
          <StudioEmptyState
            title="No collections yet"
            description="Group works into bodies, seasons, or stories. Collections you create will be listed here."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {collections.map((collection) => (
            <article
              key={collection.id}
              className="studio-card flex min-h-40 flex-col p-6"
            >
              <p className="studio-eyebrow">Collection</p>
              <h2 className="text-studio-ink text-card mt-auto">
                {collection.name}
              </h2>
              <p className="text-studio-muted mt-2 text-sm leading-6">
                {collection.description ?? "No description yet"}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
