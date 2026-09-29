import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { resolveTagScan } from "@/features/art-tags/actions";

// Scan landing pages: not for search indexes, and never prerendered (every
// render may count a scan).
export const metadata: Metadata = {
  title: "ArtTag",
  description: "Scan an ArtWall tag to discover the artwork",
  robots: { index: false, follow: true },
};
export const dynamic = "force-dynamic";

export default async function TagPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  const result = await resolveTagScan(uid);

  // An unknown tag is a real 404 (status code too), not a 200 page.
  if (!result) notFound();

  if (!result.artwork) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-display font-heading">Tag scanned</h1>
        <p className="text-ink-muted mt-4">
          {"private" in result && result.private
            ? "The artwork on this ArtTag is not public right now."
            : "This ArtTag has not been bound to an artwork yet."}
        </p>
      </main>
    );
  }

  const { artwork } = result;

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      {artwork.imageUrl && (
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-neutral-100">
          <Image
            src={artwork.imageUrl}
            alt={artwork.title}
            fill
            className="object-contain"
            sizes="(min-width: 768px) 512px, 100vw"
          />
        </div>
      )}
      <h1 className="text-display font-heading mt-6">{artwork.title}</h1>
      <p className="text-ink-muted mt-2">
        by{" "}
        <Link
          href={`/artist/${artwork.artistHandle}`}
          className="text-ink hover:underline"
        >
          {artwork.artistName}
        </Link>
      </p>
      <dl className="mt-4 flex gap-6 text-sm">
        {artwork.medium && (
          <div>
            <dt className="text-ink-muted text-xs uppercase">Medium</dt>
            <dd>{artwork.medium}</dd>
          </div>
        )}
        {artwork.year && (
          <div>
            <dt className="text-ink-muted text-xs uppercase">Year</dt>
            <dd>{artwork.year}</dd>
          </div>
        )}
      </dl>
    </main>
  );
}
