import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CloudinaryImage as Image } from "@/components/media/cloudinary-image";

import { CertificateMintPanel } from "@/components/blockchain/certificate-mint-panel";
import { WalletProviders } from "@/components/blockchain/wallet-providers";
import { JsonLd } from "@/components/seo/json-ld";
import {
  verifyCertificateByHash,
  getProvenanceTimeline,
} from "@/features/coa/actions";
import { cachedCatalog } from "@/lib/catalog-cache";
import { verifyTokenOnChain } from "@/lib/blockchain/chain";
import type { Address } from "viem";

// The certificate is cached inside verifyCertificateByHash (PERF-2.07); its
// provenance is too. Both are expired by every issue/revoke/mint write.
const loadTimeline = cachedCatalog(getProvenanceTimeline, "provenance", 3600);

/**
 * coa_certificates.status (CHECK 0015) → what a stranger checking the work
 * should read. "draft" never appears here: getCertificateForVerify excludes
 * it, so an unissued certificate 404s like any other unknown hash (FE-2.09).
 */
const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  issued: { label: "Issued", tone: "ok" },
  revoked: { label: "Revoked", tone: "bad" },
  metadata_pinned: { label: "Issued · not yet minted", tone: "ok" },
  minting: { label: "Issued · minting on-chain", tone: "ok" },
  minted: { label: "Issued · minted on-chain", tone: "ok" },
  failed: { label: "Issued · on-chain mint failed", tone: "warn" },
};
const TONE = {
  ok: "text-green-700 bg-green-500",
  warn: "text-amber-700 bg-amber-500",
  bad: "text-red-700 bg-red-500",
};

// Hashes are hex digests and ids are short tokens; anything else is not worth a query.
// Cached per-request so generateMetadata and the page body share one lookup.
const load = cache((hash: string) =>
  /^[\w-]{1,128}$/.test(hash) ? verifyCertificateByHash(hash) : Promise.resolve(null)
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hash: string }>;
}): Promise<Metadata> {
  const cert = await load((await params).hash);
  if (!cert) return { title: "Certificate not found", robots: { index: false } };
  return {
    title: `Verify: ${cert.artworkTitle} · ${cert.artistName}`,
    description: `Certificate of Authenticity for ${cert.artworkTitle} by ${cert.artistName} on ArtWall.`,
    // Only an issued, non-revoked certificate is worth indexing.
    robots: { index: cert.status !== "revoked" },
  };
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  const cert = await load(hash);
  // A real 404 (status code too, see not-found.tsx) for an unknown or draft hash.
  if (!cert) notFound();

  const timeline = await loadTimeline(cert.artworkId);
  const status = STATUS[cert.status] ?? {
    label: `Unknown status (${cert.status})`,
    tone: "warn" as const,
  };
  const [text, dot] = TONE[status.tone].split(" ");
  // The mint panel drives the NFT flow, which starts from a pinned certificate.
  const mintable = ["metadata_pinned", "minting", "failed"].includes(cert.status);

  // BC-2.12: a "minted" status is a DB record of what verifyMintTx found at
  // confirm time — re-check live, right now, rather than trusting that the
  // DB row was never missed by a reconcile run. Not cached (unlike the
  // certificate lookup above): this must reflect the chain at request time.
  let onChain: { verified: boolean; reason?: string } | null = null;
  if (cert.status === "minted" && cert.tokenId && cert.contractAddr && cert.chainId) {
    const verdict = await verifyTokenOnChain(
      cert.tokenId,
      cert.chainId,
      cert.contractAddr as Address,
      cert.metadataUri ?? undefined,
    );
    onChain = verdict.verified
      ? { verified: verdict.tokenUriMatches, reason: verdict.tokenUriMatches ? undefined : "tokenURI mismatch" }
      : { verified: false, reason: verdict.reason };
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p
        data-testid="cert-status"
        className={`flex items-center gap-2 text-sm ${text}`}
      >
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        {status.label}
      </p>

      {onChain && (
        <p
          data-testid="onchain-status"
          className={`mt-2 flex items-center gap-2 text-sm ${onChain.verified ? "text-green-700" : "text-red-700"}`}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${onChain.verified ? "bg-green-500" : "bg-red-500"}`}
          />
          {onChain.verified
            ? "On-chain: verified just now"
            : `On-chain: unverified (${onChain.reason ?? "check failed"})`}
        </p>
      )}

      <h1 className="text-display font-heading mt-4">{cert.artworkTitle}</h1>

      <a
        href={`/verify/${hash}/pdf`}
        className="text-ink-muted mt-2 inline-block text-sm underline"
      >
        Download certificate PDF
      </a>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-ink-muted">Artist</dt>
          <dd className="font-medium">{cert.artistName}</dd>
        </div>
        {cert.medium && (
          <div>
            <dt className="text-ink-muted">Medium</dt>
            <dd>{cert.medium}</dd>
          </div>
        )}
        {cert.dimensions && (
          <div>
            <dt className="text-ink-muted">Dimensions</dt>
            <dd>{cert.dimensions}</dd>
          </div>
        )}
        {cert.year && (
          <div>
            <dt className="text-ink-muted">Year</dt>
            <dd>{cert.year}</dd>
          </div>
        )}
        <div className="col-span-2">
          <dt className="text-ink-muted">Metadata hash</dt>
          <dd className="break-all font-mono text-xs">{hash}</dd>
        </div>
        {cert.issuedAt && (
          <div>
            <dt className="text-ink-muted">Issued</dt>
            <dd>
              {new Date(cert.issuedAt).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </dd>
          </div>
        )}
        {cert.revokedAt && (
          <div>
            <dt className="text-ink-muted">Revoked</dt>
            <dd>
              {new Date(cert.revokedAt).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </dd>
          </div>
        )}
      </dl>

      {cert.artworkImage && (
        <div className="relative mt-8 aspect-[4/3] overflow-hidden rounded-lg bg-neutral-100">
          <Image
            src={cert.artworkImage}
            alt={cert.artworkTitle}
            fill
            className="object-contain"
            sizes="(min-width: 768px) 640px, 100vw"
          />
        </div>
      )}

      <section className="mt-10" aria-labelledby="chain-heading">
        <h2 id="chain-heading" className="text-section font-heading">
          On-chain verification
        </h2>
        {cert.txHash && cert.tokenId ? (
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-ink-muted">Token ID</dt>
              <dd className="font-mono text-xs">{cert.tokenId}</dd>
            </div>
            {cert.chainId && (
              <div>
                <dt className="text-ink-muted">Chain ID</dt>
                <dd>{cert.chainId}</dd>
              </div>
            )}
            {cert.contractAddr && (
              <div className="col-span-2">
                <dt className="text-ink-muted">Contract</dt>
                <dd className="break-all font-mono text-xs">{cert.contractAddr}</dd>
              </div>
            )}
            <div className="col-span-2">
              <dt className="text-ink-muted">Transaction</dt>
              <dd className="break-all font-mono text-xs">{cert.txHash}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-ink-muted mt-3 text-sm">
            Not anchored on-chain. This certificate is an authentic ArtWall record,
            but it has not been minted as an NFT yet.
          </p>
        )}
      </section>

      {timeline.length > 0 && (
        <section className="mt-12">
          <h2 className="text-section font-heading">Provenance</h2>
          <ol className="mt-4 space-y-3 border-l-2 border-neutral-200 pl-6">
            {timeline.map((ev) => (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[1.9rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-neutral-400" />
                <p className="text-sm font-medium capitalize">{ev.eventType}</p>
                {ev.label && (
                  <p className="text-ink-muted text-sm">{ev.label}</p>
                )}
                <p className="text-ink-muted text-xs">
                  {new Date(ev.occurredAt).toLocaleDateString("en-IN")}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {cert.viewerIsOwner && mintable && (
        <section className="mt-12" aria-labelledby="mint-heading">
          <h2 id="mint-heading" className="text-section font-heading">
            Mint as NFT
          </h2>
          <div className="mt-4">
            <WalletProviders>
              <CertificateMintPanel certificateId={cert.id} initialStatus={cert.status} />
            </WalletProviders>
          </div>
        </section>
      )}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "VisualArtwork",
          name: cert.artworkTitle,
          creator: { "@type": "Person", name: cert.artistName },
          artMedium: cert.medium,
          dateCreated: cert.year?.toString(),
        }}
      />
    </main>
  );
}
