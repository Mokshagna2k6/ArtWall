import type { Metadata } from "next";
import { CloudinaryImage as Image } from "@/components/media/cloudinary-image";
import Link from "next/link";
import { AtSign, Globe2, MapPin } from "lucide-react";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/seo/json-ld";
import { siteConfig } from "@/config/site";
import { deriveArtistLevel } from "@/features/policy/artist-level";
import { ArtistLevelBadge } from "@/features/policy/artist-level-badge";
import { getFollowState } from "@/features/social/actions";
import { getArtistVerification } from "@/features/social/endorsements";
import { FollowButton } from "@/features/social/follow-button";
import { VerificationPanel } from "@/features/social/verification-panel";
import { getPublicArtistProfile } from "@/lib/artist-profiles";
import { cachedCatalog } from "@/lib/catalog-cache";
import { getSessionUser } from "@/lib/session";

// Catalogue cache (PERF-2.06): same for every visitor, expired on profile/artwork writes.
const loadArtist = cachedCatalog(getPublicArtistProfile, "artist", 3600);

export async function generateMetadata({
  params,
}: PageProps<"/artist/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const artist = await loadArtist(handle.toLowerCase());
  if (!artist) return { title: "Artist not found" };

  const { profile, artworks } = artist;
  // A real sentence beats a bare name in a search result: discipline and
  // location are what someone actually searches for ("ceramic artist Jaipur"),
  // and the bio is the artist's own words where they wrote one.
  const descriptor = [profile.discipline, profile.location].filter(Boolean).join(" · ");
  const description =
    profile.bio?.slice(0, 160) ??
    `${profile.displayName}${descriptor ? ` — ${descriptor}` : ""}. ${
      artworks.length > 0 ? `${artworks.length} works` : "Work"
    } on ArtWall.`;

  const title = descriptor
    ? `${profile.displayName} — ${descriptor}`
    : profile.displayName;
  const canonical = `/artist/${profile.handle}`;
  // The artist's own portrait is a far better share card than a generic one.
  const ogImage = profile.avatarUrl ?? artworks.find((w) => w.imageUrl)?.imageUrl;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      title,
      description,
      url: canonical,
      siteName: siteConfig.name,
      images: ogImage ? [{ url: ogImage, alt: profile.displayName }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function ArtistProfilePage({
  params,
}: PageProps<"/artist/[handle]">) {
  const { handle } = await params;
  const artist = await loadArtist(handle.toLowerCase());
  if (!artist) notFound();
  const { profile, artworks, collections, identity } = artist;
  const websiteLabel = profile.website?.replace(/^https?:\/\/(www\.)?/, "");

  // Per-viewer, so outside the catalogue cache above (same reasoning as the
  // artwork page). Both readers swallow their own failures, so a social
  // outage leaves the profile intact rather than 500ing it.
  const viewer = await getSessionUser();
  const [follow, verification] = await Promise.all([
    getFollowState(profile.userId),
    getArtistVerification(profile.userId),
  ]);

  // Bible §4 A0-A4, derived — no stored column. The peer/curator axis comes
  // from the verification read above rather than the mirrored
  // artist_profiles.verification_status column, so the summary and the panel
  // below it can never disagree on the same render.
  const artistLevel = deriveArtistLevel({
    ...identity,
    portfolioPublished: profile.published,
    endorsementStatus: verification.status,
  });

  const canonicalUrl = `${siteConfig.url}/artist/${profile.handle}`;

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

            <div className="mt-8">
              <FollowButton
                profileUserId={profile.userId}
                returnTo={`/artist/${profile.handle}`}
                initialFollowing={follow.viewerFollows}
                initialFollowers={follow.followers}
                signedIn={viewer !== null}
                isSelf={viewer?.id === profile.userId}
              />
            </div>

            {/* §3/§4: the A-level summary sits ABOVE the per-dimension panel,
                never instead of it — both are always rendered. */}
            <div className="mt-8 max-w-2xl">
              <ArtistLevelBadge summary={artistLevel} artistName={profile.displayName} />
            </div>

            <div className="mt-4 max-w-2xl">
              <VerificationPanel
                artistId={profile.userId}
                artistName={profile.displayName}
                verification={verification}
                signedIn={viewer !== null}
                returnTo={`/artist/${profile.handle}`}
              />
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
      {collections.length > 0 && (
        <section className="max-w-page mx-auto px-5 pt-16 sm:px-8 lg:px-16">
          <p className="text-signal text-eyebrow">Series & portfolios</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((c) => (
              <Link key={c.id} href={`/collections/${c.slug}`} className="border-border hover:bg-muted border p-5">
                <p className="text-muted-foreground text-xs tracking-wider uppercase">{c.isFeatured ? "Featured" : "Series"}</p>
                <h3 className="font-heading text-card mt-2">{c.title}</h3>
                {c.description && <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">{c.description}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}
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

      {/* Person + an ItemList of their work. `mainEntityOfPage` ties the two
          together so a crawler reads one profile rather than two loose nodes.
          Community endorsement is deliberately NOT emitted as any kind of
          schema.org verification claim — it is a reputation signal, and
          dressing it as a credential would misrepresent it. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Person",
          "@id": canonicalUrl,
          name: profile.displayName,
          url: canonicalUrl,
          ...(profile.bio ? { description: profile.bio } : {}),
          ...(profile.discipline ? { jobTitle: profile.discipline } : {}),
          ...(profile.avatarUrl ? { image: profile.avatarUrl } : {}),
          ...(profile.location ? { homeLocation: { "@type": "Place", name: profile.location } } : {}),
          sameAs: [
            profile.website,
            profile.instagram ? `https://instagram.com/${profile.instagram}` : null,
          ].filter(Boolean),
          worksFor: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
          ...(artworks.length > 0
            ? {
                mainEntityOfPage: {
                  "@type": "CollectionPage",
                  "@id": canonicalUrl,
                  hasPart: artworks.slice(0, 20).map((artwork) => ({
                    "@type": "VisualArtwork",
                    name: artwork.title,
                    url: `${siteConfig.url}/artwork/${artwork.id}`,
                    ...(artwork.imageUrl ? { image: artwork.imageUrl } : {}),
                    ...(artwork.medium ? { artMedium: artwork.medium } : {}),
                    ...(artwork.year ? { dateCreated: String(artwork.year) } : {}),
                    creator: { "@type": "Person", "@id": canonicalUrl, name: profile.displayName },
                  })),
                },
              }
            : {}),
        }}
      />
    </main>
  );
}
