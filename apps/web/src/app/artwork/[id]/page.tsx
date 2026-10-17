import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Nfc, QrCode } from "lucide-react";

import { CloudinaryImage as Image } from "@/components/media/cloudinary-image";
import { JsonLd } from "@/components/seo/json-ld";
import { features } from "@/config/site";
import { AddToCollectionButton } from "@/features/collections/add-to-collection-button";
import { getProvenanceTimeline } from "@/features/coa/actions";
import { loadDemandSignal } from "@/features/demand/aggregate";
import { DemandMeter } from "@/features/demand/demand-meter";
import { loadEscrowSplitPreview } from "@/features/escrow/preview";
import { EscrowSplitBreakdown } from "@/features/escrow/split-breakdown";
import { InquireButton } from "@/features/inquiries/inquire-button";
import { getArtworkDetail } from "@/features/marketplace/actions";
import { ArtworkTabs } from "@/features/marketplace/artwork-tabs";
import { ArtworkViewer } from "@/features/marketplace/artwork-viewer";
import { purchasability } from "@/features/marketplace/purchasable";
import { ShareArtworkButton } from "@/features/marketplace/share-button";
import { AddToCartButtons } from "@/features/orders/components/cart-buttons";
import { formatINR } from "@/features/physical-wall/money";
import { loadTrustDimensionLevels } from "@/features/policy/trust";
import { TrustPanel } from "@/features/policy/trust-panel";
import { auth } from "@/lib/auth";
import { cachedCatalog } from "@/lib/catalog-cache";

// Same for every visitor: served from the catalogue cache (PERF-2.06).
const loadArtwork = cachedCatalog(getArtworkDetail, "artwork-detail", 3600);
const loadTimeline = cachedCatalog(getProvenanceTimeline, "provenance", 3600);
// FE-3.01-3.04: the trust panel's five dimensions, same cache window as the
// rest of this page's catalogue data — they change only on review/mint
// events, not per request.
const loadTrustLevels = cachedCatalog(loadTrustDimensionLevels, "trust-levels", 3600);
// FE-3.06: the demand meter reads the pre-aggregated table (PERF-3.04), so
// this is cheap enough to cache on the same window too.
const loadDemand = cachedCatalog(loadDemandSignal, "demand-signal", 3600);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const artwork = await loadArtwork(id);
  if (!artwork) return { title: "Artwork not found" };
  return {
    title: `${artwork.title} by ${artwork.artistName}`,
    description:
      artwork.description?.slice(0, 160) ??
      `${artwork.title} — ${artwork.medium ?? "artwork"}`,
  };
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-ink-muted text-xs uppercase">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

export default async function ArtworkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const artwork = await loadArtwork(id);
  if (!artwork) notFound();

  const timeline = await loadTimeline(id);
  const trustLevels = await loadTrustLevels(id);
  const demand = await loadDemand(id);
  // FE-3.14: not run through cachedCatalog — commission_policy_versions is
  // not in the catalogue cache's invalidation set (expireCatalog only covers
  // artworks/artist_profiles/exhibitions/coa_certificates), and a payment
  // split must reflect the currently active policy, not a stale one.
  const escrowSplit = await loadEscrowSplitPreview(id, artwork.pricePaise);

  // Per-viewer, so deliberately NOT inside the shared catalogue cache above:
  // the own-work branch of the Buy Now gate depends on who is looking. The
  // root layout already reads the session, so this page was dynamic already —
  // the page stays public and indexable (Phase 1 §1 depends on that).
  const session = await auth.api.getSession({ headers: await headers() });
  const viewerId = session?.user.id ?? null;

  // §8.7: Buy Now only when the work is genuinely purchasable. This is the
  // same rule the cart and checkout enforce (features/orders/cart-rules.ts),
  // so the page cannot offer a purchase that checkout would then refuse.
  // `demand.thresholdCrossed` is passed as a BOOLEAN only. Bible §44 forbids a
  // score, threshold or confidence number reaching a public surface.
  const buy = purchasability(
    artwork,
    viewerId,
    features.marketplaceCheckout,
    demand.thresholdCrossed
  );
  // Structured data must describe the work, not the viewer: the owner looking
  // at their own listing must not strip the Offer out of the page's JSON-LD.
  const publiclyForSale = purchasability(
    artwork,
    null,
    features.marketplaceCheckout,
    demand.thresholdCrossed
  ).buyable;

  // `callbackUrl` and not `next`: that is the param /sign-in reads on this
  // branch, and it goes through the existing safeCallback open-redirect check.
  // Phase 1 adds `next` as an alias for it, so this keeps working either way.
  const signInHref = `/sign-in?callbackUrl=${encodeURIComponent(`/artwork/${artwork.id}`)}`;

  const images = [artwork.imageUrl].filter((url): url is string => Boolean(url));
  const linkedTag = artwork.tags[0] ?? null;
  const artistVerified = trustLevels.artistVerificationStatus === "approved";
  const issuedCert = artwork.certificates.find((cert) => cert.status === "issued") ?? null;
  // Privacy (§8.7): the reference shows "Private" for issued by / owned by.
  // Owner identity is never printed on a public page, so this is fixed text
  // rather than a field some later change could accidentally fill in.
  const PRIVATE = "Private";

  return (
    // Split view (ref: verisart.com artwork page): the image is pinned to the
    // viewport and only the detail column scrolls, so the work stays visible
    // while reading provenance. Below lg it collapses to one normal column.
    <main className="lg:h-[calc(100dvh-var(--header-h,4rem))] lg:overflow-hidden">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-0 lg:px-0 lg:py-0">
        <div className="bg-band/40 lg:flex lg:h-full lg:items-center lg:justify-center lg:p-10">
          <ArtworkViewer images={images} title={artwork.title} />
        </div>

        <div className="lg:h-full lg:overflow-y-auto lg:px-10 lg:py-12">
          <div className="flex items-start justify-between gap-4">
            <p className="text-ink-muted flex items-center gap-1.5 text-sm">
              <Link href={`/artist/${artwork.artistHandle}`} className="hover:underline">
                {artwork.artistName}
              </Link>
              {artistVerified && (
                <BadgeCheck aria-label="Verified artist" className="size-4 text-green-600" />
              )}
            </p>
            <ShareArtworkButton title={artwork.title} artistName={artwork.artistName} />
          </div>

          <h1 className="text-display font-heading mt-2">{artwork.title}</h1>

          {artwork.pricePaise != null && (
            <p className="mt-4 text-xl font-medium">{formatINR(artwork.pricePaise)}</p>
          )}

          {linkedTag && (
            <p className="border-hairline text-ink-muted mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
              {linkedTag.tagType === "nfc" ? (
                <Nfc aria-hidden className="size-3.5 text-green-600" />
              ) : (
                <QrCode aria-hidden className="size-3.5 text-green-600" />
              )}
              {linkedTag.tagType === "nfc" ? "NFC tag linked" : "QR tag linked"}
            </p>
          )}

          <DemandMeter signal={demand} />

          {escrowSplit && <EscrowSplitBreakdown split={escrowSplit} />}

          {/* Buy Now exists only when the work is really buyable; otherwise
              Inquire is the only call to action. */}
          {buy.buyable ? (
            <AddToCartButtons artworkId={artwork.id} />
          ) : (
            <p className="text-ink-muted mt-4 text-sm">{buy.message}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <InquireButton
              artworkId={artwork.id}
              artworkTitle={artwork.title}
              artistName={artwork.artistName}
              viewerName={session?.user.name ?? null}
              signInHref={signInHref}
            />
            <AddToCollectionButton artworkId={artwork.id} />
          </div>

          {artwork.description && (
            <div className="text-ink-muted mt-6 text-sm leading-relaxed">
              {artwork.description}
            </div>
          )}

          <TrustPanel levels={trustLevels} />

          <section className="border-hairline mt-8 border-t pt-6">
            <div className="flex items-center gap-3">
              {artwork.artistAvatar && (
                <Image
                  src={artwork.artistAvatar}
                  alt=""
                  width={40}
                  height={40}
                  className="rounded-full"
                />
              )}
              <div>
                <p className="text-sm font-medium">{artwork.artistName}</p>
                <Link
                  href={`/artist/${artwork.artistHandle}`}
                  className="text-ink-muted text-xs hover:underline"
                >
                  View profile →
                </Link>
              </div>
            </div>
            {artwork.artistBio && (
              <p className="text-ink-muted mt-3 line-clamp-3 text-sm">{artwork.artistBio}</p>
            )}
          </section>
        </div>
      </div>

      <ArtworkTabs
        details={
          <dl className="grid gap-5 text-sm sm:grid-cols-3">
            <Fact label="Production year" value={artwork.year?.toString()} />
            <Fact
              label="Object type"
              value={issuedCert?.objectType ?? artwork.category}
            />
            <Fact
              label="Edition"
              value={
                artwork.edition
                  ? artwork.edition.isAp
                    ? "Artist's proof"
                    : artwork.edition.editionNumber && artwork.edition.totalEditions
                      ? `${artwork.edition.editionNumber} of ${artwork.edition.totalEditions}`
                      : artwork.edition.editionType
                  : "Unique work"
              }
            />
            <Fact label="Dimensions" value={artwork.dimensions} />
            <Fact label="Medium" value={artwork.medium} />
            <Fact label="Location" value={artwork.artistLocation} />
          </dl>
        }
        coaPlus={
          artwork.certificates.length === 0 ? (
            <p className="text-ink-muted text-sm">
              No certificate of authenticity has been issued for this work yet.
            </p>
          ) : (
            <div className="flex flex-col gap-7">
              <dl className="grid gap-5 text-sm sm:grid-cols-3">
                <Fact
                  label="Verified issuer"
                  value={artistVerified ? "Verified on ArtWall" : "Not verified"}
                />
                <Fact
                  label="Creator authorized"
                  value={issuedCert ? "Yes" : "Certificate not issued"}
                />
                <Fact
                  label="Physical link"
                  value={linkedTag ? `${linkedTag.tagType.toUpperCase()} tag bound` : "Not linked"}
                />
                <Fact label="Created by" value={issuedCert?.creatorName ?? artwork.artistName} />
                <Fact label="Signed by" value={issuedCert?.creatorName ?? artwork.artistName} />
                {/* Issuer and current-owner identity are never published. */}
                <Fact label="Issued by" value={PRIVATE} />
                <Fact label="Owned by" value={PRIVATE} />
              </dl>
              <ul className="flex flex-col gap-3">
                {artwork.certificates.map((cert) => (
                  <li
                    key={cert.id}
                    className="border-hairline flex flex-wrap items-center gap-3 rounded border p-4 text-sm"
                  >
                    <span
                      aria-hidden
                      className={`h-2 w-2 rounded-full ${
                        cert.status === "issued" ? "bg-green-500" : "bg-neutral-400"
                      }`}
                    />
                    <Link
                      href={`/verify/${cert.hash}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {cert.hash.slice(0, 24)}…
                    </Link>
                    <span className="text-ink-muted text-xs capitalize">{cert.status}</span>
                    <span className="text-ink-muted text-xs">COA level {cert.coaLevel}</span>
                    {cert.issuedAt && (
                      <span className="text-ink-muted text-xs">
                        Issued {new Date(cert.issuedAt).toLocaleDateString("en-IN")}
                      </span>
                    )}
                    <Link href={`/verify/${cert.hash}`} className="ml-auto text-xs underline">
                      Verify
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        }
        history={
          <div className="flex flex-col gap-10">
            <div>
              <h3 className="font-heading text-card">Provenance</h3>
              {timeline.length === 0 ? (
                <p className="text-ink-muted mt-3 text-sm">No provenance events recorded yet.</p>
              ) : (
                <ol className="mt-4 space-y-3 border-l-2 border-neutral-200 pl-6">
                  {timeline.map((ev) => (
                    <li key={ev.id} className="relative">
                      <span
                        aria-hidden
                        className={`absolute top-1.5 -left-[1.9rem] h-2.5 w-2.5 rounded-full border-2 border-white ${
                          ev.txHash ? "bg-green-500" : "bg-neutral-400"
                        }`}
                      />
                      <p className="text-sm font-medium capitalize">{ev.eventType}</p>
                      {ev.label && <p className="text-ink-muted text-sm">{ev.label}</p>}
                      <p className="text-ink-muted text-xs">
                        {new Date(ev.occurredAt).toLocaleDateString("en-IN")}
                      </p>
                      {ev.txHash && (
                        <p className="mt-0.5 font-mono text-xs text-green-600">
                          tx: {ev.txHash.slice(0, 10)}…
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div>
              <h3 className="font-heading text-card">Physical link</h3>
              {linkedTag ? (
                <dl className="mt-4 grid gap-5 text-sm sm:grid-cols-3">
                  <Fact label="Tag type" value={linkedTag.tagType.toUpperCase()} />
                  <Fact label="Serial" value={linkedTag.tagUid} />
                  <Fact
                    label="Date linked"
                    value={
                      linkedTag.boundAt
                        ? new Date(linkedTag.boundAt).toLocaleDateString("en-IN")
                        : null
                    }
                  />
                  <Fact label="Linked by" value={linkedTag.linkedByName ?? PRIVATE} />
                  <Fact label="Scans" value={String(linkedTag.scanCount)} />
                </dl>
              ) : (
                <p className="text-ink-muted mt-3 text-sm">
                  No NFC or QR tag is linked to this work.
                </p>
              )}
            </div>

            <div>
              <h3 className="font-heading text-card">Printed certificate</h3>
              {issuedCert?.pdfUrl ? (
                <a
                  href={issuedCert.pdfUrl}
                  className="mt-3 inline-block text-sm underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Download the printed certificate (PDF)
                </a>
              ) : issuedCert ? (
                <p className="text-ink-muted mt-3 text-sm">
                  A certificate is issued for this work, but the printed PDF has not been
                  generated. Verify it online at{" "}
                  <Link href={`/verify/${issuedCert.hash}`} className="underline">
                    its verification page
                  </Link>
                  .
                </p>
              ) : (
                <p className="text-ink-muted mt-3 text-sm">
                  No printed certificate has been produced for this work.
                </p>
              )}
            </div>
          </div>
        }
      />

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "VisualArtwork",
          name: artwork.title,
          creator: { "@type": "Person", name: artwork.artistName },
          artMedium: artwork.medium,
          dateCreated: artwork.year?.toString(),
          image: artwork.imageUrl,
          // Only advertise an Offer when the work is really for sale, so the
          // structured data cannot disagree with the page's own buttons.
          offers:
            artwork.pricePaise && publiclyForSale
              ? {
                  "@type": "Offer",
                  price: (artwork.pricePaise / 100).toFixed(2),
                  priceCurrency: "INR",
                  availability: "https://schema.org/InStock",
                }
              : undefined,
        }}
      />
    </main>
  );
}
