import Image from "next/image";
import { Plus } from "lucide-react";

import { getArtworks } from "@/app/actions/artworks";
import {
  StudioButton,
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";

export default async function ArtworksPage() {
  const items = await getArtworks();
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Catalogue"
        title="Artworks"
        description="Keep every work, detail, and movement in one considered archive."
        action={
          <StudioButton href="/studio/artworks/new">
            <Plus data-icon="inline-start" />
            Add artwork
          </StudioButton>
        }
      />
      {items.length === 0 ? (
        <div className="studio-card">
          <StudioEmptyState
            title="Your catalogue is waiting"
            description="There are no artworks in this workspace yet. Add a work to capture its image, story, materials, value, and history."
            action={
              <StudioButton href="/studio/artworks/new">
                <Plus data-icon="inline-start" />
                Add artwork
              </StudioButton>
            }
          />
        </div>
      ) : (
        <>
          <p className="text-studio-muted text-sm">
            {items.length} {items.length === 1 ? "work" : "works"} in your
            catalogue. Public works appear on your ArtWall profile after you
            publish it.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article key={item.id} className="studio-card overflow-hidden">
                <div className="bg-muted relative aspect-[4/3]">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.title}
                      fill
                      className="object-cover"
                      sizes="(min-width: 1280px) 25vw, (min-width: 768px) 45vw, 100vw"
                    />
                  ) : (
                    <div className="text-studio-muted flex h-full items-center justify-center text-sm">
                      No image yet
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-3 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="studio-eyebrow">{item.status}</p>
                    <span className="text-studio-muted text-xs">
                      {item.isPublic ? "Public profile" : "Private"}
                    </span>
                  </div>
                  <h2 className="text-studio-ink text-card">{item.title}</h2>
                  <p className="text-studio-muted text-sm">
                    {[item.year, item.medium, item.dimensions]
                      .filter(Boolean)
                      .join(" · ") || "Details to be added"}
                  </p>
                  {item.description && (
                    <p className="text-studio-muted line-clamp-2 text-sm leading-6">
                      {item.description}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
