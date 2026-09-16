import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getArtworkDetail } from "@/features/marketplace/actions";
import { getProvenanceTimeline } from "@/features/coa/actions";
import { formatINR } from "@/features/physical-wall/money";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const artwork = await getArtworkDetail(id);
  if (!artwork) return { title: "Artwork not found" };
  return {
    title: `${artwork.title} by ${artwork.artistName} | ArtWall`,
    description: artwork.description?.slice(0, 160) ?? `${artwork.title} — ${artwork.medium ?? "artwork"}`,
  };
}

export default async function ArtworkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const artwork = await getArtworkDetail(id);
  if (!artwork) notFound();

  const timeline = await getProvenanceTimeline(id);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="grid gap-10 lg:grid-cols-2">
        {/* Image */}
        <div className="bg-band relative aspect-square overflow-hidden rounded-lg">
          {artwork.imageUrl ? (
            <Image
              src={artwork.imageUrl}
              alt={artwork.title}
              fill
              className="object-contain"
              sizes="(min-width: 1024px) 50vw, 100vw"
              priority
            />
          ) : (
            <div className="text-ink-muted flex h-full items-center justify-center">
              No image
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <p className="text-ink-muted text-sm">
            <Link
              href={`/artist/${artwork.artistHandle}`}
              className="hover:underline"
            >
              {artwork.artistName}
            </Link>
          </p>
          <h1 className="text-display font-heading mt-2">{artwork.title}</h1>

          {artwork.pricePaise != null && (
            <p className="mt-4 text-xl font-medium">
              {formatINR(artwork.pricePaise)}
            </p>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            {artwork.medium && (
              <div>
                <dt className="text-ink-muted text-xs uppercase">Medium</dt>
                <dd>{artwork.medium}</dd>
              </div>
            )}
            {artwork.dimensions && (
              <div>
                <dt className="text-ink-muted text-xs uppercase">Dimensions</dt>
                <dd>{artwork.dimensions}</dd>
              </div>
            )}
            {artwork.year && (
              <div>
                <dt className="text-ink-muted text-xs uppercase">Year</dt>
                <dd>{artwork.year}</dd>
              </div>
            )}
            {artwork.category && (
              <div>
                <dt className="text-ink-muted text-xs uppercase">Category</dt>
                <dd className="capitalize">{artwork.category}</dd>
              </div>
            )}
          </dl>

          {artwork.description && (
            <div className="text-ink-muted mt-6 text-sm leading-relaxed">
              {artwork.description}
            </div>
          )}

          {/* Certificates */}
          {artwork.certificates.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xs font-medium uppercase tracking-wider">
                Certificates of Authenticity
              </h2>
              <ul className="mt-3 space-y-2">
                {artwork.certificates.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <span
                      className={`h-2 w-2 rounded-full ${c.status === "issued" ? "bg-green-500" : "bg-red-500"}`}
                    />
                    <Link
                      href={`/verify/${c.hash}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {c.hash.slice(0, 16)}…
                    </Link>
                    <span className="text-ink-muted text-xs capitalize">
                      {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Artist */}
          <section className="border-hairline mt-8 border-t pt-6">
            <div className="flex items-center gap-3">
              {artwork.artistAvatar && (
                <Image
                  src={artwork.artistAvatar}
                  alt=""
                  width={40}
                  height={40}
                  className="rounded-full"
                />
              )}
              <div>
                <p className="text-sm font-medium">{artwork.artistName}</p>
                <Link
                  href={`/artist/${artwork.artistHandle}`}
                  className="text-ink-muted text-xs hover:underline"
                >
                  View profile →
                </Link>
              </div>
            </div>
            {artwork.artistBio && (
              <p className="text-ink-muted mt-3 line-clamp-3 text-sm">
                {artwork.artistBio}
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Provenance timeline */}
      {timeline.length > 0 && (
        <section className="mt-16">
          <h2 className="text-section font-heading">Provenance</h2>
          <ol className="mt-4 space-y-3 border-l-2 border-neutral-200 pl-6">
            {timeline.map((ev) => (
              <li key={ev.id} className="relative">
                <span
                  className={`absolute -left-[1.9rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
                    ev.txHash ? "bg-green-500" : "bg-neutral-400"
                  }`}
                />
                <p className="text-sm font-medium capitalize">{ev.eventType}</p>
                {ev.label && (
                  <p className="text-ink-muted text-sm">{ev.label}</p>
                )}
                <p className="text-ink-muted text-xs">
                  {new Date(ev.occurredAt).toLocaleDateString("en-IN")}
                </p>
                {ev.txHash && (
                  <p className="mt-0.5 font-mono text-xs text-green-600">
                    tx: {ev.txHash.slice(0, 10)}…
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "VisualArtwork",
            name: artwork.title,
            creator: { "@type": "Person", name: artwork.artistName },
            artMedium: artwork.medium,
            dateCreated: artwork.year?.toString(),
            image: artwork.imageUrl,
            offers: artwork.pricePaise
              ? {
                  "@type": "Offer",
                  price: (artwork.pricePaise / 100).toFixed(2),
                  priceCurrency: "INR",
                }
              : undefined,
          }),
        }}
      />
    </main>
  );
}
