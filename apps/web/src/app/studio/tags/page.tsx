import Link from "next/link";

import { QrCode } from "@/features/physical-wall/components/qr-code";
import { siteConfig } from "@/config/site";

import { getStudioArtistProfile } from "@/app/actions/artist-profile";
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
  // Same source of truth as the COA PDF and the uptime check.
  const scanBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? siteConfig.url;
  const [tags, works, profile] = await Promise.all([
    getArtTags(),
    getArtworks(),
    getStudioArtistProfile(),
  ]);
  const artworks = works.map((a) => ({ id: a.id, title: a.title }));

  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Showcase"
        title="ArtTags"
        description="QR and NFC tags that lead a scan straight to the work. Bind a tag to one of your artworks; a scan only shows it while the work is public."
      />
      {!profile.published && (
        // resolveTagScan hides every work of an unpublished artist, so without
        // this the "Artwork is public" box would promise more than a scan shows.
        <p role="note" className="studio-card text-studio-muted p-4 text-sm">
          Your profile is not published yet, so scans show &ldquo;not public
          right now&rdquo; even for public works. Publish it from{" "}
          <Link href="/studio/settings" className="text-studio-accent hover:underline">
            Settings
          </Link>
          .
        </p>
      )}
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

              {/* The scannable code itself. Without this the page described a
                  QR tag but never showed one, leaving no way to print a label:
                  "Scan page" opens what a VISITOR sees after scanning, which
                  is the opposite end of the journey. Rendered server-side as
                  inline SVG so it prints sharp at any label size. */}
              <div className="flex items-start gap-4">
                <QrCode
                  value={`${scanBaseUrl}/tag/${encodeURIComponent(tag.tagUid)}`}
                  size={120}
                  label={`QR code for tag ${tag.tagUid}`}
                />
                <p className="text-studio-muted text-xs leading-5">
                  Print this beside the work. A scan opens its page
                  {tag.artworkTitle ? "" : " once you bind the tag to an artwork"}.
                </p>
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
