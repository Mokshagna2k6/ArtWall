import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";

import { getPublishedArtistProfiles } from "@/lib/artist-profiles";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Artists", description: "Discover artists who have chosen to share their work on ArtWall." };

export default async function ArtistsPage() {
  const artists = await getPublishedArtistProfiles();
  return <main className="bg-[#faf9f5] px-5 pt-32 pb-20 sm:px-8 lg:px-16"><section className="mx-auto max-w-6xl"><p className="text-ember text-caption tracking-[0.14em] uppercase">ArtWall community</p><h1 className="font-heading mt-4 max-w-3xl text-5xl tracking-tight sm:text-6xl">Meet the artists building their public archive.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Each profile belongs to the artist. Their selected works, statement and links appear only after they choose to publish.</p>{artists.length === 0 ? <div className="mt-14 border border-border bg-background p-10 text-center text-muted-foreground">The first public profiles are being prepared. Check back soon.</div> : <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{artists.map((artist) => <Link key={artist.userId} href={`/artist/${artist.handle}`} className="group border border-border bg-background p-6 transition-shadow hover:shadow-medium"><div className="flex items-center gap-4"><div className="relative size-14 shrink-0 overflow-hidden rounded-full bg-muted">{artist.avatarUrl ? <Image src={artist.avatarUrl} alt="" fill className="object-cover" sizes="56px" /> : <span className="flex h-full items-center justify-center font-heading text-xl text-muted-foreground">{artist.displayName.slice(0, 1)}</span>}</div><div><h2 className="font-heading text-2xl">{artist.displayName}</h2><p className="mt-1 text-sm text-muted-foreground">{artist.discipline ?? "ArtWall artist"}</p></div></div>{artist.location && <p className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="size-4 text-ember" />{artist.location}</p>}<span className="mt-6 inline-flex items-center gap-2 text-sm font-medium">Visit profile <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span></Link>)}</div>}</section></main>;
}
