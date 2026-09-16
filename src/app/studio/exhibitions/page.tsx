import {
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";
import { getExhibitions } from "@/features/exhibitions/actions";

export default async function ExhibitionsPage() {
  const items = await getExhibitions();
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Showcase"
        title="Exhibitions"
        description="Create virtual or physical exhibitions to showcase your work."
      />
      {items.length === 0 ? (
        <div className="studio-card">
          <StudioEmptyState
            title="No exhibitions yet"
            description="Create an exhibition to curate and share a collection of your artworks."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="studio-card p-5">
              <div className="flex items-center justify-between">
                <p className="studio-eyebrow capitalize">{item.status}</p>
                {item.startDate && (
                  <span className="text-studio-muted text-xs">
                    {new Date(item.startDate).toLocaleDateString("en-IN")}
                  </span>
                )}
              </div>
              <h2 className="text-studio-ink text-card mt-3">{item.title}</h2>
              {item.venue && (
                <p className="text-studio-muted mt-1 text-sm">{item.venue}</p>
              )}
              {item.description && (
                <p className="text-studio-muted mt-2 line-clamp-2 text-sm">
                  {item.description}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
