import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AtSign, Globe2, MapPin } from "lucide-react";
import { notFound } from "next/navigation";

import { getPublicArtistProfile } from "@/lib/artist-profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/artist/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const artist = await getPublicArtistProfile(handle.toLowerCase());
  if (!artist) return { title: "Artist not found" };
  return {
    title: artist.profile.displayName,
    description:
      artist.profile.bio ?? `${artist.profile.displayName} on ArtWall`,
    alternates: { canonical: `/artist/${artist.profile.handle}` },
  };
}

export default async function ArtistProfilePage({
  params,
}: PageProps<"/artist/[handle]">) {
  const { handle } = await params;
  const artist = await getPublicArtistProfile(handle.toLowerCase());
  if (!artist) notFound();
  const { profile, artworks } = artist;
  const websiteLabel = profile.website?.replace(/^https?:\/\/(www\.)?/, "");

  return (
    <main className="bg-[#ffffff] pt-20">
      <section className="border-border border-b px-5 py-16 sm:px-8 md:py-24 lg:px-16">
        <div className="max-w-page mx-auto grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div>
            <p className="text-signal text-eyebrow">ArtWall artist</p>
            <h1 className="font-heading text-display mt-4 text-balance">
              {profile.displayName}
            </h1>
            <p className="text-muted-foreground mt-4 text-lg">
              {[profile.discipline, profile.location]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {profile.bio && (
              <p className="text-foreground/80 mt-8 max-w-2xl text-base leading-8">
                {profile.bio}
              </p>
            )}
            <div className="mt-7 flex flex-wrap gap-4 text-sm">
              {profile.location && (
                <span className="text-muted-foreground inline-flex items-center gap-2">
                  <MapPin className="text-ember size-4" />
                  {profile.location}
                </span>
              )}
              {profile.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 underline underline-offset-4"
                >
                  <Globe2 className="text-ember size-4" />
                  {websiteLabel}
                </a>
              )}
              {profile.instagram && (
                <a
                  href={`https://instagram.com/${profile.instagram}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 underline underline-offset-4"
                >
                  <AtSign className="text-ember size-4" />@{profile.instagram}
                </a>
              )}
            </div>
          </div>
          <div className="bg-muted relative aspect-square overflow-hidden rounded-full">
            {profile.avatarUrl ? (
              <Image
                src={profile.avatarUrl}
                alt={`Portrait of ${profile.displayName}`}
                fill
                className="object-cover"
                sizes="240px"
              />
            ) : (
              <div className="font-heading text-numeral text-hairline flex h-full items-center justify-center">
                {profile.displayName.slice(0, 1)}
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="max-w-page mx-auto px-5 py-20 sm:px-8 lg:px-16 lg:py-32">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-signal text-eyebrow">Selected works</p>
            <h2 className="font-heading text-section mt-3">The catalogue</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            {artworks.length} {artworks.length === 1 ? "work" : "works"}
          </p>
        </div>
        {artworks.length === 0 ? (
          <div className="border-border bg-background text-muted-foreground mt-10 border p-10 text-center">
            This artist is preparing their first public work.
          </div>
        ) : (
          <div className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {artworks.map((artwork) => (
              <article key={artwork.id}>
                <div className="bg-muted relative aspect-[4/5] overflow-hidden">
                  {artwork.imageUrl ? (
                    <Image
                      src={artwork.imageUrl}
                      alt={artwork.title}
                      fill
                      className="object-cover transition-transform duration-500 hover:scale-[1.02]"
                      sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                    />
                  ) : (
                    <div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">
                      Image coming soon
                    </div>
                  )}
                </div>
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-card">{artwork.title}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {[artwork.year, artwork.medium, artwork.dimensions]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-xs tracking-wider uppercase">
                    {artwork.status}
                  </span>
                </div>
                {artwork.description && (
                  <p className="text-muted-foreground mt-3 text-sm leading-6">
                    {artwork.description}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="border-border border-t px-5 py-12 text-center sm:px-8">
        <Link href="/artists" className="text-sm underline underline-offset-4">
          Discover more ArtWall artists
        </Link>
      </section>
    </main>
  );
}
