import type { Metadata } from "next";
import { CloudinaryImage as Image } from "@/components/media/cloudinary-image";
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
  searchParams,
}: {
  params: Promise<{ uid: string }>;
  searchParams: Promise<{ picc_data?: string; cmac?: string }>;
}) {
  const { uid } = await params;
  // BC-3.09: an NTAG424 DNA tag's NDEF URL appends ?picc_data=&cmac= (SDM) —
  // present only for a genuine chip scan, verified in resolveTagScan.
  const { picc_data, cmac } = await searchParams;
  const result = await resolveTagScan(uid, { piccData: picc_data, cmac });

  // An unknown uid is a real 404 (status code too, see not-found.tsx).
  if (!result) notFound();

  if (!result.artwork) {
    // FE-2.11: one generic message whether the tag is unbound or bound to a
    // private/unpublished work — the response must not let a scanner tell
    // the two apart, since that would reveal that a private artwork exists.
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-display font-heading">Tag scanned</h1>
        <p className="text-ink-muted mt-4">
          No public artwork is linked to this ArtTag right now.
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
