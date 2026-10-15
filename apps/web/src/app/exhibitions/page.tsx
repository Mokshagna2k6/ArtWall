import type { Metadata } from "next";
import Link from "next/link";

import { listPublicExhibitions } from "@/features/exhibitions/actions";
import { cachedCatalog } from "@/lib/catalog-cache";

/**
 * The public exhibitions index.
 *
 * Only /exhibitions/[id] existed before this; the marketplace-first header
 * (CHANGES-PLAN.md §3) puts Exhibitions in the primary nav, and a primary nav
 * item that 404s is the one thing config/nav.ts's own comment says not to
 * ship. Deliberately a plain list rather than a second gallery grid: an
 * exhibition's own page is where the work is shown.
 *
 * Same catalogue cache and window as /exhibitions/[id] (PERF-2.06).
 */
const load = cachedCatalog(listPublicExhibitions, "exhibitions-index", 3600);

export const metadata: Metadata = {
  title: "Exhibitions",
  description:
    "Exhibitions by India's contemporary artists on ArtWall — online shows, with the work and the provenance behind it.",
  alternates: { canonical: "/exhibitions" },
};

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

function dates(startDate: string | null, endDate: string | null): string | null {
  if (!startDate) return null;
  return endDate ? `${fmt(startDate)} – ${fmt(endDate)}` : `From ${fmt(startDate)}`;
}

export default async function ExhibitionsPage() {
  const exhibitions = await load();

  return (
    <main className="max-w-page mx-auto px-5 pt-32 pb-20 sm:px-8 sm:pt-40 lg:px-16">
      <p className="text-muted-foreground text-eyebrow">Exhibitions</p>
      <h1 className="font-heading text-display mt-6 max-w-[20ch] text-balance">
        Shows on ArtWall.
      </h1>
      <p className="text-muted-foreground text-lead mt-6 max-w-2xl">
        Exhibitions curated by the artists themselves. Every work in them carries
        its own provenance record.
      </p>

      {exhibitions.length === 0 ? (
        <p className="text-muted-foreground mt-16 text-sm">
          No exhibitions are open just now.{" "}
          <Link href="/discover" className="underline">
            Browse the catalogue
          </Link>{" "}
          in the meantime.
        </p>
      ) : (
        <ul className="border-border mt-16 border-t">
          {exhibitions.map((exh) => {
            const when = dates(exh.startDate, exh.endDate);
            return (
              <li key={exh.id} className="border-border border-b">
                <Link href={`/exhibitions/${exh.id}`} className="group block py-8">
                  <p className="text-muted-foreground text-sm">{exh.artistName}</p>
                  <h2 className="font-heading text-section mt-2 group-hover:underline">
                    {exh.title}
                  </h2>
                  {(exh.venue || when) && (
                    <p className="text-muted-foreground mt-2 text-sm">
                      {[exh.venue, when].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {exh.description && (
                    <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-7">
                      {exh.description.slice(0, 220)}
                      {exh.description.length > 220 && "…"}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
