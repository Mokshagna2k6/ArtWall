import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getPublicExhibition } from "@/features/exhibitions/actions";

// Keyed by id: exhibitions have no slug column. Only published ones resolve.
const load = cache((id: string) => getPublicExhibition(id));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const exh = await load((await params).id);
  if (!exh) return { title: "Exhibition not found" };
  return {
    title: `${exh.title} · ${exh.artistName}`,
    description: exh.description ?? `An exhibition by ${exh.artistName} on ArtWall.`,
  };
}

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

export default async function ExhibitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const exh = await load((await params).id);
  if (!exh) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 pt-28 pb-16">
      <p className="text-ink-muted text-label tracking-wider uppercase">
        Exhibition · {exh.artistName}
      </p>
      <h1 className="text-display font-heading mt-3">{exh.title}</h1>
      {(exh.venue || exh.startDate) && (
        <p className="text-ink-muted mt-3">
          {[
            exh.venue,
            exh.startDate &&
              (exh.endDate
                ? `${fmt(exh.startDate)} – ${fmt(exh.endDate)}`
                : `From ${fmt(exh.startDate)}`),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {exh.description && (
        <p className="mt-6 max-w-2xl leading-7">{exh.description}</p>
      )}

      {exh.artworks.length === 0 ? (
        <p className="text-ink-muted mt-12">No works are on show yet.</p>
      ) : (
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {exh.artworks.map((work) => (
            <li key={work.id}>
              <Link href={`/artwork/${work.id}`} className="group block">
                <div className="bg-band relative aspect-[4/3] overflow-hidden rounded-lg">
                  {work.imageUrl ? (
                    <Image
                      src={work.imageUrl}
                      alt={work.title}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                      sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                    />
                  ) : (
                    <div className="text-ink-muted flex h-full items-center justify-center text-sm">
                      No image
                    </div>
                  )}
                </div>
                <h2 className="mt-3 text-sm font-medium group-hover:underline">
                  {work.title}
                </h2>
                <p className="text-ink-muted text-xs">
                  {[work.medium, work.year].filter(Boolean).join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
