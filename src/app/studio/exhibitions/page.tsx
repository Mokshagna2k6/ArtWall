import Link from "next/link";
import { inArray } from "drizzle-orm";

import { getArtworks } from "@/app/actions/artworks";
import {
  CreateExhibitionForm,
  ExhibitionControls,
} from "@/components/dashboard/exhibition-actions";
import {
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";
import { getExhibitions } from "@/features/exhibitions/actions";
import { db } from "@/lib/db/index";
import { exhibitionArtworks } from "@/lib/db/schema";

export default async function ExhibitionsPage() {
  const [items, artworks] = await Promise.all([getExhibitions(), getArtworks()]);
  // Exhibitions are already scoped to this artist by getExhibitions.
  const links = items.length
    ? await db
        .select()
        .from(exhibitionArtworks)
        .where(
          inArray(
            exhibitionArtworks.exhibitionId,
            items.map((i) => i.id)
          )
        )
    : [];
  const title = new Map(artworks.map((a) => [a.id, a.title]));

  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Showcase"
        title="Exhibitions"
        description="Create virtual or physical exhibitions to showcase your work."
      />
      <CreateExhibitionForm />
      {items.length === 0 ? (
        <div className="studio-card">
          <StudioEmptyState
            title="No exhibitions yet"
            description="Create an exhibition above, add works to it, then publish it to give it a public page."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const inShow = links
              .filter((l) => l.exhibitionId === item.id)
              .map((l) => l.artworkId);
            return (
              <article
                key={item.id}
                className="studio-card p-5"
                data-testid={`exhibition-${item.id}`}
              >
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
                <p className="text-studio-muted mt-2 text-sm">
                  {inShow.length
                    ? inShow.map((id) => title.get(id) ?? "Untitled").join(", ")
                    : "No works added yet."}
                </p>
                {item.status === "published" && (
                  <Link
                    href={`/exhibitions/${item.id}`}
                    className="text-studio-accent mt-2 inline-block text-xs hover:underline"
                  >
                    Public page →
                  </Link>
                )}
                <ExhibitionControls
                  exhibitionId={item.id}
                  status={item.status}
                  artworks={artworks
                    .filter((a) => !inShow.includes(a.id))
                    .map((a) => ({ id: a.id, title: a.title }))}
                />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
