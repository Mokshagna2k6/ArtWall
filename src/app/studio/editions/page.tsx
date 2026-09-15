import {
  StudioEmptyState,
  StudioPageHeader,
  StudioButton,
} from "@/components/dashboard/studio-shell";
import { getEditions } from "@/features/coa/actions";

export default async function EditionsPage() {
  const items = await getEditions();
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Organization"
        title="Editions"
        description="Track edition sizes, numbering, and availability without losing the story behind the work."
      />
      {items.length === 0 ? (
        <div className="studio-card">
          <StudioEmptyState
            title="No editions yet"
            description="Edition records will appear here once you add a reproducible body of work."
          />
        </div>
      ) : (
        <>
          <p className="text-studio-muted text-sm">
            {items.length} {items.length === 1 ? "edition" : "editions"}
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article key={item.id} className="studio-card p-5">
                <div className="flex items-center justify-between">
                  <p className="studio-eyebrow">{item.editionType}</p>
                  <span className="text-studio-muted text-xs capitalize">
                    {item.status}
                  </span>
                </div>
                <h2 className="text-studio-ink text-card mt-3">
                  {item.artworkTitle}
                </h2>
                <p className="text-studio-muted mt-1 text-sm">
                  {item.editionType === "limited"
                    ? `${item.editionNumber ?? "—"} / ${item.totalEditions}`
                    : item.editionType === "unique"
                      ? "Unique work"
                      : "Open edition"}
                  {item.isAp ? " · Artist Proof" : ""}
                </p>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
