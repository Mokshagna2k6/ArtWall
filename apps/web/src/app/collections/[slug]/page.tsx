import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CloudinaryImage as Image } from "@/components/media/cloudinary-image";
import { formatINR } from "@/features/physical-wall/money";
import { getPublicCollection } from "@/features/collections/actions";
import { JsonLd } from "@/components/seo/json-ld";
import { features } from "@/config/site";
import { AddCollectionToCartButton } from "@/features/orders/components/cart-buttons";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getPublicCollection(slug);
  if (!collection) return { title: "Collection not found" };
  return {
    title: collection.title,
    description: collection.thesis ?? collection.description ?? `${collection.title} — an ArtWall collection.`,
    alternates: { canonical: `/collections/${collection.slug}` },
  };
}

export default async function PublicCollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await getPublicCollection(slug);
  if (!collection) notFound();

  const isCurator = collection.type === "CURATOR";
  const isArtist = collection.type === "ARTIST";

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-ink-muted text-eyebrow">
        {isCurator ? "Curated collection" : isArtist ? "Artist series" : "Collection"}
        {collection.isFeatured ? " · Featured" : ""}
      </p>
      <h1 className="font-heading text-display mt-3">{collection.title}</h1>
      {collection.description && <p className="text-ink-muted mt-3 max-w-2xl text-sm leading-6">{collection.description}</p>}
      {collection.thesis && (
        <blockquote className="border-hairline mt-6 max-w-2xl border-l-2 pl-4 text-base leading-7 italic">
          {collection.thesis}
        </blockquote>
      )}
      <p className="text-ink-muted mt-6 text-sm">
        {collection.artworks.length} {collection.artworks.length === 1 ? "artwork" : "artworks"}
      </p>
      {features.marketplaceCheckout && collection.artworks.some((a) => a.pricePaise != null) && (
        <AddCollectionToCartButton collectionId={collection.id} />
      )}

      <div className={isCurator ? "mt-10 flex flex-col gap-4" : "mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3"}>
        {collection.artworks.map((artwork) =>
          isCurator ? (
            <article key={artwork.artworkId} className="border-hairline flex items-center gap-4 border-b pb-4">
              <div className="bg-band relative aspect-square w-24 shrink-0 overflow-hidden rounded">
                {artwork.imageUrl && <Image src={artwork.imageUrl} alt={artwork.title} fill className="object-cover" sizes="96px" />}
              </div>
              <div className="flex-1">
                <h3 className="font-heading text-card">{artwork.title}</h3>
                <Link href={`/artist/${artwork.artistHandle}`} className="text-ink-muted text-sm hover:underline">
                  {artwork.artistName}
                </Link>
              </div>
              {artwork.pricePaise != null && <p className="text-sm font-medium">{formatINR(artwork.pricePaise)}</p>}
              <Link href={`/artwork/${artwork.artworkId}`} className="studio-button">
                View
              </Link>
            </article>
          ) : (
            <article key={artwork.artworkId}>
              <Link href={`/artwork/${artwork.artworkId}`}>
                <div className="bg-muted relative aspect-[4/5] overflow-hidden">
                  {artwork.imageUrl ? (
                    <Image src={artwork.imageUrl} alt={artwork.title} fill className="object-cover transition-transform duration-500 hover:scale-[1.02]" sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw" />
                  ) : (
                    <div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">No image</div>
                  )}
                </div>
              </Link>
              <div className="mt-4">
                <h3 className="font-heading text-card">{artwork.title}</h3>
                {artwork.artistName && (
                  <Link href={`/artist/${artwork.artistHandle}`} className="text-muted-foreground mt-1 text-sm hover:underline">
                    {artwork.artistName}
                  </Link>
                )}
                {artwork.pricePaise != null && <p className="mt-1 text-sm font-medium">{formatINR(artwork.pricePaise)}</p>}
              </div>
            </article>
          )
        )}
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: collection.title,
          description: collection.thesis ?? collection.description ?? undefined,
        }}
      />
    </main>
  );
}
