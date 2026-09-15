import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { resolveTagScan } from "@/features/art-tags/actions";

export const metadata: Metadata = {
  title: "ArtTag | ArtWall",
  description: "Scan an ArtWall tag to discover the artwork",
};

export default async function TagPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  const result = await resolveTagScan(uid);

  if (!result) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-display font-heading">Tag not found</h1>
        <p className="text-ink-muted mt-4">
          This ArtTag is not registered on ArtWall.
        </p>
      </main>
    );
  }

  if (!result.artwork) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-display font-heading">Tag scanned</h1>
        <p className="text-ink-muted mt-4">
          This ArtTag has not been bound to an artwork yet.
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
