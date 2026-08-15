import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { siteConfig } from "@/config/site";
import { ArtworkActions } from "@/features/physical-wall/components/artwork-actions";
import {
  countScans,
  getPublicArtwork,
  getReactionCounts,
} from "@/features/physical-wall/data/wall";

export const revalidate = 60;

/**
 * The artwork page (F22).
 *
 * This is where a QR scan lands, so it is the most-visited page in the whole
 * feature and the only one most visitors will ever see. Three things it does
 * deliberately:
 *
 *  - **The artist's contact details never appear.** Interest routes through the
 *    platform. A page that printed an email would turn every wall into a
 *    lead-scraping surface.
 *  - **An ended work resolves to an archived page, not a 404.** Printed labels
 *    outlive exhibitions, links get shared, and search engines remember. A dead
 *    end at the end of a QR is a bad experience and a lost page.
 *  - **Schema.org VisualArtwork** in the markup, so a shared link previews
 *    properly and the work is legible to search.
 */
export async function generateMetadata({
  params,
}: PageProps<"/physical-wall/a/[id]">): Promise<Metadata> {
  const { id } = await params;
  const work = await getPublicArtwork(id);
  if (!work) return { title: "Artwork not found" };

  return {
    title: `${work.title} — ${work.artistName}`,
    description:
      work.description ??
      `${work.title} by ${work.artistName}, on the ArtWall at Ric Platter.`,
    alternates: { canonical: `/physical-wall/a/${id}` },
    openGraph: {
      title: `${work.title} — ${work.artistName}`,
      description: work.description ?? `On the ArtWall at Ric Platter.`,
      images: work.imageUrl ? [{ url: work.imageUrl }] : undefined,
      type: "article",
    },
  };
}

export default async function ArtworkPage({
  params,
}: PageProps<"/physical-wall/a/[id]">) {
  const { id } = await params;
  const work = await getPublicArtwork(id);
  if (!work) notFound();

  const [scans, reactions] = await Promise.all([
    countScans(id),
    getReactionCounts(id),
  ]);
  const isHanging = work.slotLabel !== "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    name: work.title,
    creator: { "@type": "Person", name: work.artistName },
    artMedium: work.medium ?? undefined,
    dateCreated: work.year ? String(work.year) : undefined,
    image: work.imageUrl ?? undefined,
    description: work.description ?? undefined,
    url: `${siteConfig.url}/physical-wall/a/${id}`,
  };

  return (
    <main className="pt-20">
      <script
        type="application/ld+json"
        // Values come from our own database and are serialised by JSON.stringify,
        // which escapes the characters that could break out of a script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="mx-auto max-w-5xl px-5 py-12 sm:px-8 md:py-16">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="bg-band border-hairline relative aspect-4/5 overflow-hidden rounded-md border">
            {work.imageUrl ? (
              <Image
                src={work.imageUrl}
                alt={work.title}
                fill
                priority
                sizes="(min-width: 768px) 34rem, 90vw"
                className="object-cover"
              />
            ) : (
              <div className="text-ink-muted flex h-full items-center justify-center text-sm">
                No image
              </div>
            )}
          </div>

          <div>
            {isHanging ? (
              <p className="text-signal text-eyebrow">
                On the wall · slot {work.slotLabel}
              </p>
            ) : (
              <p className="text-ink-muted text-eyebrow">
                No longer on the wall
              </p>
            )}

            <h1 className="font-heading text-display mt-3 text-balance">
              {work.title}
            </h1>

            <p className="text-ink-muted mt-3 text-base">
              {work.artistHandle ? (
                <Link
                  href={`/artist/${work.artistHandle}`}
                  className="hover:text-ink underline underline-offset-4"
                >
                  {work.artistName}
                </Link>
              ) : (
                work.artistName
              )}
              {work.artistCity ? ` · ${work.artistCity}` : ""}
            </p>

            {/* The spec grid, from the prototype: the four facts a visitor
                standing in front of a piece actually asks for, set as data
                rather than buried in a sentence. */}
            <dl className="border-hairline mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y py-5 sm:grid-cols-4">
              {[
                ["Medium", work.medium],
                ["Year", work.year ? String(work.year) : null],
                ["Position", isHanging ? `Slot ${work.slotLabel}` : "Archived"],
                ["Until", isHanging && work.endDate ? work.endDate : "—"],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-label text-ink-muted tracking-wider uppercase">
                      {label}
                    </dt>
                    <dd className="mt-1 text-sm font-medium">{value}</dd>
                  </div>
                ))}
            </dl>

            {work.description && (
              <p className="mt-6 text-base leading-7">{work.description}</p>
            )}

            <div className="mt-8">
              <ArtworkActions
                artworkId={id}
                title={work.title}
                artistName={work.artistName}
                shareUrl={`${siteConfig.url}/physical-wall/a/${id}`}
                initialCounts={reactions}
              />
            </div>

            {!isHanging && (
              <p className="border-hairline text-ink-muted mt-6 rounded-md border border-dashed p-4 text-sm leading-6">
                This work has come down from the wall. The page stays put so the
                link — and the label, if you are holding one — keeps working.
              </p>
            )}

            <div className="border-hairline mt-8 border-t pt-6">
              <p className="text-ink-muted text-label tracking-wider uppercase">
                Interested in this work?
              </p>
              <p className="text-ink-muted mt-2 text-sm leading-6">
                Enquiries go through ArtWall, not the artist&rsquo;s inbox.
                We&rsquo;ll put you in touch.
              </p>
              <Link
                href={`/contact?about=${encodeURIComponent(work.title)}`}
                className="border-hairline-strong hover:border-ink text-small mt-4 inline-flex h-10 items-center rounded-md border px-4"
              >
                Ask about this work
              </Link>
            </div>

            {scans > 0 && (
              <p className="text-ink-muted mt-6 text-xs">
                Scanned {scans.toLocaleString("en-IN")}{" "}
                {scans === 1 ? "time" : "times"}.
              </p>
            )}
          </div>
        </div>
      </article>
    </main>
  );
}
