import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";

import { getPublishedArtistProfiles } from "@/lib/artist-profiles";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Artists",
  description:
    "Discover artists who have chosen to share their work on ArtWall.",
};

export default async function ArtistsPage() {
  const artists = await getPublishedArtistProfiles();
  return (
    <main className="px-5 pt-32 pb-16 sm:px-8 sm:pt-40 sm:pb-20 lg:px-16 lg:pt-48 lg:pb-24">
      <section className="max-w-page mx-auto">
        <p className="text-signal text-eyebrow">ArtWall community</p>
        <h1 className="font-heading text-display mt-7 max-w-[18ch] text-balance">
          Meet the artists building their public archive.
        </h1>
        <p className="text-muted-foreground text-lead mt-5 max-w-2xl">
          Each profile belongs to the artist. Their selected works, statement
          and links appear only after they choose to publish.
        </p>
        {artists.length === 0 ? (
          <div className="border-border bg-background text-muted-foreground mt-14 border p-10 text-center">
            The first public profiles are being prepared. Check back soon.
          </div>
        ) : (
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {artists.map((artist) => (
              <Link
                key={artist.userId}
                href={`/artist/${artist.handle}`}
                className="group border-border bg-background hover:shadow-medium border p-6 transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-full">
                    {artist.avatarUrl ? (
                      <Image
                        src={artist.avatarUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    ) : (
                      <span className="font-heading text-card text-muted-foreground flex h-full items-center justify-center">
                        {artist.displayName.slice(0, 1)}
                      </span>
                    )}
                  </div>
                  <div>
                    <h2 className="font-heading text-subsection">
                      {artist.displayName}
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {artist.discipline ?? "ArtWall artist"}
                    </p>
                  </div>
                </div>
                {artist.location && (
                  <p className="text-muted-foreground mt-6 inline-flex items-center gap-2 text-sm">
                    <MapPin className="text-ember size-4" />
                    {artist.location}
                  </p>
                )}
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium">
                  Visit profile{" "}
                  <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
