import type { Metadata } from "next";
import Image from "next/image";

import { CertificateMintPanel } from "@/components/blockchain/certificate-mint-panel";
import { WalletProviders } from "@/components/blockchain/wallet-providers";
import { JsonLd } from "@/components/seo/json-ld";
import {
  verifyCertificateByHash,
  getProvenanceTimeline,
} from "@/features/coa/actions";

/**
 * coa_certificates.status (CHECK 0015) → what a stranger checking the work
 * should read. Only "revoked" may say revoked; a draft was never issued.
 */
const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  draft: { label: "Not issued (draft)", tone: "warn" },
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

export const metadata: Metadata = {
  title: "Verify Certificate | ArtWall",
  description: "Verify an ArtWall Certificate of Authenticity",
};

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  const cert = await verifyCertificateByHash(hash);

  if (!cert) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="text-display font-heading">Certificate not found</h1>
        <p className="text-ink-muted mt-4">
          No certificate matches this hash. The work may not have been certified
          on ArtWall, or the hash may be incorrect.
        </p>
      </main>
    );
  }

  const timeline = await getProvenanceTimeline(cert.artworkId);
  const status = STATUS[cert.status] ?? {
    label: `Unknown status (${cert.status})`,
    tone: "warn" as const,
  };
  const [text, dot] = TONE[status.tone].split(" ");
  // The mint panel drives the NFT flow, which starts from a pinned certificate.
  const mintable = ["metadata_pinned", "minting", "failed"].includes(cert.status);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p
        data-testid="cert-status"
        className={`flex items-center gap-2 text-sm ${text}`}
      >
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        {status.label}
      </p>

      <h1 className="text-display font-heading mt-4">{cert.artworkTitle}</h1>

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
              <CertificateMintPanel certificateId={cert.id} />
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
