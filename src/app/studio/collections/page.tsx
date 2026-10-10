import { headers } from "next/headers";
import Link from "next/link";
import { eq, and } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { artistProfiles, curators } from "@/lib/db/schema";
import { getMyCollections } from "@/features/collections/actions";
import { CollectionCreateForm } from "@/features/collections/collection-create-form";
import type { CollectionType } from "@/features/collections/policy";
import {
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";

const TYPE_LABEL: Record<CollectionType, string> = {
  BUYER: "Personal",
  ARTIST: "Artist portfolio",
  CURATOR: "Curator",
};

export default async function CollectionsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user.id;
  if (!userId) {
    return (
      <div className="studio-card">
        <StudioEmptyState title="Sign in required" description="Sign in to see your collections." />
      </div>
    );
  }

  const [hasArtistProfile, isCurator, myCollections] = await Promise.all([
    db
      .select({ userId: artistProfiles.userId })
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, userId))
      .then((r) => r.length > 0),
    db
      .select({ id: curators.id })
      .from(curators)
      .where(and(eq(curators.userId, userId), eq(curators.status, "active")))
      .then((r) => r.length > 0),
    getMyCollections(),
  ]);

  const availableTypes: CollectionType[] = [
    "BUYER",
    ...(hasArtistProfile ? (["ARTIST"] as const) : []),
    ...(isCurator ? (["CURATOR"] as const) : []),
  ];

  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Organization"
        title="Collections"
        description="Group artworks you want to organize, showcase as a series, or curate — without owning them."
        action={<CollectionCreateForm availableTypes={availableTypes} />}
      />
      {!isCurator && (
        <p className="text-studio-muted text-sm">
          Want to build a curator collection?{" "}
          <Link href="/curator/apply" className="text-studio-ink underline underline-offset-4">
            Apply to become a curator
          </Link>
          .
        </p>
      )}
      {myCollections.length === 0 ? (
        <div className="studio-card">
          <StudioEmptyState
            title="No collections yet"
            description="Create a collection to group artworks by theme, series, or curation. Artworks keep their original owner — a collection only groups references to them."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {myCollections.map((collection) => (
            <Link
              key={collection.id}
              href={`/studio/collections/${collection.slug}`}
              className="studio-card flex min-h-40 flex-col p-6"
            >
              <p className="studio-eyebrow">
                {TYPE_LABEL[collection.type as CollectionType]}
                {collection.isFeatured ? " · Featured" : ""}
              </p>
              <h2 className="text-studio-ink text-card mt-auto">{collection.title}</h2>
              <p className="text-studio-muted mt-2 text-sm leading-6">
                {collection.artworkCount} {collection.artworkCount === 1 ? "artwork" : "artworks"} ·{" "}
                {collection.visibility === "public" ? "Public" : "Private"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
