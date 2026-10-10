import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { getOwnedCollectionBySlug } from "@/features/collections/actions";
import { CollectionManager } from "@/features/collections/collection-manager";
import { StudioPageHeader } from "@/components/dashboard/studio-shell";

export default async function StudioCollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) notFound();

  const collection = await getOwnedCollectionBySlug(session.user.id, slug);
  if (!collection) notFound();

  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow={collection.type === "ARTIST" ? "Artist portfolio" : collection.type === "CURATOR" ? "Curator collection" : "Personal collection"}
        title={collection.title}
        description={collection.description ?? undefined}
      />
      <CollectionManager collection={collection} />
    </div>
  );
}
