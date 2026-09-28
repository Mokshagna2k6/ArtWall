"use client";

import { useState, useTransition } from "react";

import { issueCertificate, revokeCertificate } from "@/features/coa/actions";

export function IssueCertificateForm({
  artworks,
}: {
  artworks: { id: string; title: string }[];
}) {
  const [artworkId, setArtworkId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (artworks.length === 0) return null;
  return (
    <form
      className="studio-card flex flex-wrap items-center gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          try {
            await issueCertificate(artworkId);
            setArtworkId("");
          } catch {
            setError("Could not issue this certificate. Try again.");
          }
        });
      }}
    >
      <select
        required
        aria-label="Artwork to certify"
        className="studio-input flex-1"
        value={artworkId}
        onChange={(e) => setArtworkId(e.target.value)}
      >
        <option value="">Choose an artwork…</option>
        {artworks.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title}
          </option>
        ))}
      </select>
      <button className="studio-button" disabled={pending || !artworkId}>
        {pending ? "Issuing…" : "Issue certificate"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

export function RevokeCertificateButton({ certId }: { certId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className="text-xs text-red-600 hover:underline disabled:opacity-60"
        onClick={() => {
          const reason = window.prompt(
            "Why is this certificate being revoked?"
          );
          if (!reason?.trim()) return;
          setError(null);
          start(async () => {
            try {
              await revokeCertificate(certId, reason.trim());
            } catch {
              setError("Could not revoke. Try again.");
            }
          });
        }}
      >
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </>
  );
}
