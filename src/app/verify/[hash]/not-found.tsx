export default function CertificateNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-display font-heading">Certificate not found</h1>
      <p className="text-ink-muted mt-4">
        No certificate matches this hash. The work may not have been certified on ArtWall, or
        the hash may be incorrect.
      </p>
    </main>
  );
}
