import {
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";
import { getArtworks } from "@/app/actions/artworks";
import {
  IssueCertificateForm,
  RevokeCertificateButton,
} from "@/components/dashboard/certificate-actions";
import { chainName } from "@/features/blockchain/chains";
import { getCertificates } from "@/features/coa/actions";
import { getStudioArtistProfile } from "@/app/actions/artist-profile";
import {
  ConnectWalletButton,
  MintButton,
} from "@/features/blockchain/mint-controls";

export default async function CertificatesPage() {
  const [items, artworks, profile] = await Promise.all([
    getCertificates(),
    getArtworks(),
    getStudioArtistProfile(),
  ]);
  const wallet = profile.walletAddress ?? null;
  const certifiedArtworkIds = new Set(
    items.filter((c) => c.status !== "revoked").map((c) => c.artworkId)
  );
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Archive"
        title="Certificates"
        description="Issue and verify certificates of authenticity for works in your catalogue."
      />
      <section className="studio-card flex flex-col gap-3 p-5">
        <div>
          <p className="studio-eyebrow">Blockchain provenance</p>
          <p className="text-studio-muted mt-1 text-sm">
            Anchoring a certificate on-chain is what makes a work eligible to
            exhibit. Currently on {chainName(Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? 84532))}.
          </p>
        </div>
        <ConnectWalletButton walletAddress={wallet} />
      </section>
      {/* A work with a live certificate must not be offered for issuing again:
          issuing a second one would mint a competing hash for the same piece.
          A REVOKED certificate does not count — revoking is precisely how an
          artist reissues after, say, a corrected medium or dimension. */}
      <IssueCertificateForm
        artworks={artworks
          .filter((a) => !certifiedArtworkIds.has(a.id))
          .map((a) => ({ id: a.id, title: a.title }))}
      />
      {items.length === 0 ? (
        <div className="studio-card">
          <StudioEmptyState
            title="No certificates yet"
            description={
              artworks.length
                ? "Choose a work above to issue its Certificate of Authenticity."
                : "Add an artwork first, then issue its Certificate of Authenticity here."
            }
          />
        </div>
      ) : (
        <>
          <p className="text-studio-muted text-sm">
            {items.length} {items.length === 1 ? "certificate" : "certificates"}{" "}
            issued
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article key={item.id} className="studio-card p-5">
                <div className="flex items-center justify-between">
                  <p className="studio-eyebrow capitalize">{item.status}</p>
                  {item.issuedAt && (
                    <span className="text-studio-muted text-xs">
                      {new Date(item.issuedAt).toLocaleDateString("en-IN")}
                    </span>
                  )}
                </div>
                <h2 className="text-studio-ink text-card mt-3">
                  {item.artworkTitle}
                </h2>
                <p className="text-studio-muted mt-1 font-mono text-xs">
                  {item.metadataHash.slice(0, 16)}…
                </p>
                <div className="mt-3 flex gap-2">
                  <a
                    href={`/verify/${item.metadataHash}`}
                    className="text-studio-accent text-xs hover:underline"
                  >
                    Verify page →
                  </a>
                  <a
                    href={`/api/coa/${item.id}/pdf`}
                    download={`COA-${item.id}.pdf`}
                    className="text-studio-accent text-xs hover:underline"
                  >
                    Download certificate PDF
                  </a>
                  {item.status !== "revoked" && (
                    <RevokeCertificateButton certId={item.id} />
                  )}
                </div>
                {item.status === "minted" ? (
                  <p className="text-studio-muted mt-3 text-xs">
                    Anchored on {chainName(item.chainId)}
                    {item.tokenId ? ` · token #${item.tokenId}` : ""}
                  </p>
                ) : item.status !== "revoked" ? (
                  <div className="mt-3">
                    <MintButton
                      certificateId={item.id}
                      status={item.status}
                      hasWallet={Boolean(wallet)}
                    />
                    {item.mintError && (
                      <p className="mt-1 text-xs text-red-600">{item.mintError}</p>
                    )}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
