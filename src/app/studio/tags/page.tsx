import { getArtworks } from "@/app/actions/artworks";
import {
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";
import {
  CreateTagForm,
  TagRowControls,
} from "@/components/dashboard/tag-actions";
import { getArtTags } from "@/features/art-tags/actions";

export default async function TagsPage() {
  const [tags, works] = await Promise.all([getArtTags(), getArtworks()]);
  const artworks = works.map((a) => ({ id: a.id, title: a.title }));

  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Showcase"
        title="ArtTags"
        description="QR and NFC tags that lead a scan straight to the work. Bind a tag to one of your artworks; a scan only shows it while the work is public."
      />
      <CreateTagForm artworks={artworks} />
      {tags.length === 0 ? (
        <div className="studio-card">
          <StudioEmptyState
            title="No tags yet"
            description="Register a tag by its UID above to start."
          />
        </div>
      ) : (
        <div className="studio-card divide-studio-border flex flex-col divide-y">
          {tags.map((tag) => (
            <div
              key={tag.id}
              data-testid={`tag-${tag.tagUid}`}
              className="flex flex-col gap-3 p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-studio-ink font-mono text-sm">
                    {tag.tagUid}
                  </p>
                  <p className="text-studio-muted text-xs">
                    {tag.tagType.toUpperCase()} · {tag.scanCount}{" "}
                    {tag.scanCount === 1 ? "scan" : "scans"} ·{" "}
                    {tag.artworkTitle ? `Bound to ${tag.artworkTitle}` : "Unbound"}
                  </p>
                </div>
                <a
                  href={`/tag/${encodeURIComponent(tag.tagUid)}`}
                  className="text-studio-accent text-xs hover:underline"
                >
                  Scan page →
                </a>
              </div>
              <TagRowControls
                // Remount on server changes so local (optimistic) state resets.
                key={`${tag.artworkId}:${tag.artworkIsPublic}`}
                tagId={tag.id}
                artworkId={tag.artworkId}
                artworkIsPublic={tag.artworkIsPublic}
                artworks={artworks}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
