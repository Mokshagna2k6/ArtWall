import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AtSign, Globe2, MapPin } from "lucide-react";
import { notFound } from "next/navigation";

import { getPublicArtistProfile } from "@/lib/artist-profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/artist/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const artist = await getPublicArtistProfile(handle.toLowerCase());
  if (!artist) return { title: "Artist not found" };
  return { title: artist.profile.displayName, description: artist.profile.bio ?? `${artist.profile.displayName} on ArtWall`, alternates: { canonical: `/artist/${artist.profile.handle}` } };
}

export default async function ArtistProfilePage({ params }: PageProps<"/artist/[handle]">) {
  const { handle } = await params;
  const artist = await getPublicArtistProfile(handle.toLowerCase());
  if (!artist) notFound();
  const { profile, artworks } = artist;
  const websiteLabel = profile.website?.replace(/^https?:\/\/(www\.)?/, "");

  return <main className="bg-[#faf9f5] pt-20"><section className="border-b border-border px-5 py-16 sm:px-8 md:py-24 lg:px-16"><div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]"><div><p className="text-ember text-caption tracking-[0.14em] uppercase">ArtWall artist</p><h1 className="font-heading mt-4 text-5xl tracking-tight sm:text-6xl">{profile.displayName}</h1><p className="mt-4 text-lg text-muted-foreground">{[profile.discipline, profile.location].filter(Boolean).join(" · ")}</p>{profile.bio && <p className="mt-8 max-w-2xl text-base leading-8 text-foreground/80">{profile.bio}</p>}<div className="mt-7 flex flex-wrap gap-4 text-sm">{profile.location && <span className="inline-flex items-center gap-2 text-muted-foreground"><MapPin className="size-4 text-ember" />{profile.location}</span>}{profile.website && <a href={profile.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 underline underline-offset-4"><Globe2 className="size-4 text-ember" />{websiteLabel}</a>}{profile.instagram && <a href={`https://instagram.com/${profile.instagram}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 underline underline-offset-4"><AtSign className="size-4 text-ember" />@{profile.instagram}</a>}</div></div><div className="relative aspect-square overflow-hidden rounded-full bg-muted">{profile.avatarUrl ? <Image src={profile.avatarUrl} alt={`Portrait of ${profile.displayName}`} fill className="object-cover" sizes="240px" /> : <div className="flex h-full items-center justify-center font-heading text-6xl text-muted-foreground">{profile.displayName.slice(0, 1)}</div>}</div></div></section><section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24 lg:px-16"><div className="flex items-end justify-between gap-6"><div><p className="text-ember text-caption tracking-[0.14em] uppercase">Selected works</p><h2 className="font-heading mt-3 text-4xl tracking-tight">The catalogue</h2></div><p className="text-sm text-muted-foreground">{artworks.length} {artworks.length === 1 ? "work" : "works"}</p></div>{artworks.length === 0 ? <div className="mt-10 border border-border bg-background p-10 text-center text-muted-foreground">This artist is preparing their first public work.</div> : <div className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{artworks.map((artwork) => <article key={artwork.id}><div className="relative aspect-[4/5] overflow-hidden bg-muted">{artwork.imageUrl ? <Image src={artwork.imageUrl} alt={artwork.title} fill className="object-cover transition-transform duration-500 hover:scale-[1.02]" sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw" /> : <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">Image coming soon</div>}</div><div className="mt-4 flex items-start justify-between gap-3"><div><h3 className="font-heading text-xl">{artwork.title}</h3><p className="mt-1 text-sm text-muted-foreground">{[artwork.year, artwork.medium, artwork.dimensions].filter(Boolean).join(" · ")}</p></div><span className="text-xs uppercase tracking-wider text-muted-foreground">{artwork.status}</span></div>{artwork.description && <p className="mt-3 text-sm leading-6 text-muted-foreground">{artwork.description}</p>}</article>)}</div>}</section><section className="border-t border-border px-5 py-12 text-center sm:px-8"><Link href="/artists" className="text-sm underline underline-offset-4">Discover more ArtWall artists</Link></section></main>;
}
