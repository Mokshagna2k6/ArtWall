import { ArrowUpRight, FolderKanban, Plus, Send } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getStudioArtistProfile } from "@/app/actions/artist-profile";
import { getArtworks } from "@/app/actions/artworks";
import {
  StudioButton,
  StudioMetric,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";
import { getArtTags } from "@/features/art-tags/actions";
import { getCertificates } from "@/features/coa/actions";
import { getMyCollections } from "@/features/collections/actions";
import { buildChecklist, isListedForSale } from "@/features/studio/checklist";
import { StudioChecklistPanel } from "@/features/studio/checklist-panel";
import { StudioWorkList, type WorkRow } from "@/features/studio/work-list";

export default async function StudioOverviewPage() {
  const [profile, artworks, certificates, tags, collections] = await Promise.all([
    getStudioArtistProfile(),
    getArtworks(),
    getCertificates(),
    getArtTags(),
    getMyCollections(),
  ]);
  if (!profile.onboardingCompleted) redirect("/studio/onboarding");

  const available = artworks.filter((artwork) => artwork.status === "available").length;
  const listed = artworks.filter(isListedForSale).length;

  const checklist = buildChecklist({
    profile,
    artworks,
    certificateCount: certificates.length,
    // A tag counts only once it is actually attached to a work — an unbound
    // tag row proves nothing about the catalogue.
    linkedTagCount: tags.filter((tag) => tag.artworkId != null).length,
    collectionCount: collections.length,
  });

  const rows: WorkRow[] = [
    ...artworks.map(
      (artwork): WorkRow => ({
        id: artwork.id,
        kind: "artwork",
        title: artwork.title,
        status: artwork.status,
        detail:
          [artwork.year, artwork.medium, artwork.dimensions].filter(Boolean).join(" · ") ||
          "Details to be added",
        imageUrl: artwork.imageUrl,
        createdAt: artwork.createdAt.toISOString(),
        href: "/studio/artworks",
      })
    ),
    ...certificates.map(
      (cert): WorkRow => ({
        id: cert.id,
        kind: "certificate",
        title: cert.artworkTitle,
        status: cert.status,
        detail: `Certificate ${cert.metadataHash.slice(0, 16)}…`,
        imageUrl: cert.artworkImage,
        createdAt: cert.createdAt.toISOString(),
        href: `/verify/${cert.metadataHash}`,
      })
    ),
    ...tags.map(
      (tag): WorkRow => ({
        id: tag.id,
        kind: "tag",
        title: tag.artworkTitle ?? "Unassigned tag",
        status: tag.artworkId ? "linked" : "unlinked",
        detail: `${tag.tagType.toUpperCase()} · ${tag.tagUid.slice(0, 20)} · ${tag.scanCount} ${
          tag.scanCount === 1 ? "scan" : "scans"
        }`,
        imageUrl: null,
        createdAt: (tag.boundAt ?? new Date(0)).toISOString(),
        href: "/studio/tags",
      })
    ),
  ];

  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Your ArtWall Studio"
        title={`Welcome back, ${profile.displayName.split(" ")[0]}.`}
        description={
          profile.published
            ? "Your public profile is live. Keep building the catalogue behind it."
            : "Your profile is private until you decide it is ready for the ArtWall community."
        }
        action={
          profile.published ? (
            <StudioButton href={`/artist/${profile.handle}`}>
              View profile <ArrowUpRight data-icon="inline-end" />
            </StudioButton>
          ) : (
            <StudioButton href="/studio/settings">
              <Send data-icon="inline-start" />
              Publish profile
            </StudioButton>
          )
        }
      />

      <section aria-label="Studio summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StudioMetric
          label="Catalogue"
          value={`${artworks.length} ${artworks.length === 1 ? "work" : "works"}`}
          detail="Your living archive"
        />
        <StudioMetric label="Available" value={String(available)} detail="Works marked available" />
        <StudioMetric
          label="Listed for sale"
          value={String(listed)}
          detail="Public, available and priced"
        />
        <StudioMetric
          label="Certificates"
          value={String(certificates.length)}
          detail="Issued or in draft"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <StudioChecklistPanel checklist={checklist} />
        <div className="studio-card p-6 md:p-8">
          <p className="studio-eyebrow">Public profile</p>
          <h2 className="text-studio-ink text-subsection mt-2">
            {profile.published ? "On the wall" : "Almost there"}
          </h2>
          <p className="text-studio-muted mt-3 text-sm leading-6">
            {profile.published
              ? `Visitors can find your practice at artwall.in/artist/${profile.handle}.`
              : "Complete the profile, choose the works to show, then publish only when it feels right."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <StudioButton href="/studio/settings">
              {profile.published ? "Edit public profile" : "Prepare profile"}{" "}
              <ArrowUpRight data-icon="inline-end" />
            </StudioButton>
            <StudioButton href="/studio/artworks/new">
              <Plus data-icon="inline-start" />
              Add work
            </StudioButton>
          </div>
        </div>
      </section>

      <section aria-label="Collections">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="studio-eyebrow">Collections</p>
            <h2 className="text-studio-ink text-subsection mt-2">
              {collections.length ? "Your groupings" : "Start a collection"}
            </h2>
          </div>
          <Link
            href="/studio/collections"
            className="text-studio-muted hover:text-studio-ink text-sm underline underline-offset-4"
          >
            All collections
          </Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/studio/collections"
            className="studio-card hover:border-studio-accent flex min-h-[7rem] flex-col justify-between p-5 transition-colors"
          >
            <Plus aria-hidden className="text-studio-accent size-5" />
            <span className="text-studio-ink font-medium">New collection</span>
          </Link>
          {collections.slice(0, 3).map((collection) => (
            <Link
              key={collection.id}
              href="/studio/collections"
              className="studio-card hover:border-studio-accent flex min-h-[7rem] flex-col justify-between p-5 transition-colors"
            >
              <FolderKanban aria-hidden className="text-studio-muted size-5" />
              <span className="min-w-0">
                <span className="text-studio-ink block truncate font-medium">
                  {collection.title}
                </span>
                <span className="text-studio-muted block text-xs">
                  {collection.artworkCount}{" "}
                  {collection.artworkCount === 1 ? "work" : "works"} · {collection.visibility}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <StudioWorkList rows={rows} />
    </div>
  );
}
