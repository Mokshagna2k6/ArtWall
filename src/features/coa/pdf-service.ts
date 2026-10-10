import "server-only";

import { eq } from "drizzle-orm";

import { siteConfig } from "@/config/site";
import { getCertificateForVerify } from "@/lib/catalog-cache";
import { getCertificateProof } from "@/features/coa/merkle-commit";
import { buildCertificatePdf } from "@/features/coa/pdf";
import { uploadRawFile } from "@/lib/cloudinary";
import { db } from "@/lib/db/index";
import { artistProfiles, artworks, coaCertificates } from "@/lib/db/schema";

/** Only our own Cloudinary host is fetched (no SSRF via a stored image URL); asked for a JPEG so any source format embeds. */
async function fetchArtworkImage(url: string | null) {
  try {
    const u = url ? new URL(url) : null;
    if (!u || u.protocol !== "https:" || u.hostname !== "res.cloudinary.com") return null;
    const jpg = url!.replace("/image/upload/", "/image/upload/f_jpg,w_900/");
    const res = await fetch(jpg, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return { bytes: new Uint8Array(await res.arrayBuffer()), kind: "jpg" as const };
  } catch {
    return null;
  }
}

/**
 * Render the certificate PDF. Pure read: no auth (callers gate), never writes.
 * Returns null when the certificate does not exist.
 */
export async function renderCertificatePdf(certificateId: string) {
  const [row] = await db
    .select({ cert: coaCertificates, artwork: artworks, artist: artistProfiles.displayName })
    .from(coaCertificates)
    .innerJoin(artworks, eq(coaCertificates.artworkId, artworks.id))
    .leftJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
    .where(eq(coaCertificates.id, certificateId));
  if (!row) return null;

  const proof = await getCertificateProof(certificateId).catch(() => null);
  const { cert, artwork } = row;
  return buildCertificatePdf({
    certificateId: cert.id,
    status: cert.status === "revoked" ? "revoked" : "issued",
    title: artwork.title,
    artist: row.artist ?? "Unknown",
    medium: artwork.medium,
    dimensions: artwork.dimensions,
    year: artwork.year,
    issuedAt: cert.issuedAt,
    metadataHash: cert.metadataHash,
    verifyUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? siteConfig.url}/verify/${cert.id}`,
    image: await fetchArtworkImage(artwork.imageUrl),
    onChain: { chainId: cert.chainId, contract: cert.contractAddr, tokenId: cert.tokenId, txHash: cert.txHash },
    merkle: proof ? { root: proof.root, leaf: proof.leaf, rootTxHash: proof.rootTxHash } : null,
  });
}

/**
 * Public copy for /verify/:hashOrId/pdf. Built only from getCertificateForVerify
 * (what the public verify page shows): no owner id, no metadata hash, no Merkle
 * proof, and drafts are excluded. Null when unknown.
 */
export async function renderPublicCertificatePdf(key: string) {
  const cert = await getCertificateForVerify(key);
  if (!cert) return null;
  return buildCertificatePdf({
    certificateId: cert.id,
    status: cert.status === "revoked" ? "revoked" : "issued",
    title: cert.artworkTitle,
    artist: cert.artistName ?? "Unknown",
    medium: cert.medium,
    dimensions: cert.dimensions,
    year: cert.year,
    issuedAt: cert.issuedAt ? new Date(cert.issuedAt) : null, // the catalog cache serialises dates
    verifyUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? siteConfig.url}/verify/${cert.id}`,
    image: await fetchArtworkImage(cert.artworkImage),
    onChain: { chainId: cert.chainId, contract: cert.contractAddr, tokenId: cert.tokenId, txHash: cert.txHash },
  });
}

/**
 * Render, archive to Cloudinary (raw, fixed public id so reruns overwrite) and
 * record pdf_url. Never throws: a PDF problem must not break issuance.
 */
export async function archiveCertificatePdf(certificateId: string): Promise<string | null> {
  try {
    const bytes = await renderCertificatePdf(certificateId);
    if (!bytes) return null;
    const url = await uploadRawFile(bytes, `artwall/coa/${certificateId}.pdf`);
    await db.update(coaCertificates).set({ pdfUrl: url }).where(eq(coaCertificates.id, certificateId));
    return url;
  } catch (error) {
    console.error("[coa] pdf archive failed", certificateId, error);
    return null;
  }
}
