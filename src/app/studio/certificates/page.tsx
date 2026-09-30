import {
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";
import { getArtworks } from "@/app/actions/artworks";
import {
  IssueCertificateForm,
  RevokeCertificateButton,
} from "@/components/dashboard/certificate-actions";
import { getCertificates } from "@/features/coa/actions";

export default async function CertificatesPage() {
  const [items, artworks] = await Promise.all([
    getCertificates(),
    getArtworks(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Archive"
        title="Certificates"
        description="Issue and verify certificates of authenticity for works in your catalogue."
      />
      <IssueCertificateForm
        artworks={artworks.map((a) => ({ id: a.id, title: a.title }))}
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
                  {item.status !== "revoked" && (
                    <RevokeCertificateButton certId={item.id} />
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
