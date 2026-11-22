"use client";

import { useState, useTransition } from "react";

import {
  issueCertificate,
  revokeCertificate,
  setCertificationPath,
} from "@/features/coa/actions";

/**
 * Bible sections 6-9. Worded so nobody reads a tier as a blockchain claim
 * (rule 7: a holographic COA does NOT imply blockchain provenance) — the
 * on-chain state is the separate "Blockchain provenance" panel on this page.
 */
const COA_TIERS = [
  { value: 0, label: "COA-0 — no holographic document" },
  { value: 1, label: "COA-1 — standard holographic" },
  { value: 2, label: "COA-2 — premium holographic" },
  { value: 3, label: "COA-3 — institutional" },
] as const;

export function IssueCertificateForm({
  artworks,
}: {
  artworks: { id: string; title: string }[];
}) {
  const [artworkId, setArtworkId] = useState("");
  const [coaTier, setCoaTier] = useState(0);
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
            const result = await issueCertificate(artworkId, undefined, coaTier);
            if (!result.ok) return setError(result.error);
            setArtworkId("");
            setCoaTier(0);
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
      <label className="text-studio-muted flex flex-col gap-1 text-xs">
        Holographic COA tier
        <select
          aria-label="Holographic COA tier"
          className="studio-input"
          value={coaTier}
          onChange={(e) => setCoaTier(Number(e.target.value))}
        >
          {COA_TIERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <button className="studio-button" disabled={pending || !artworkId}>
        {pending ? "Issuing…" : "Issue certificate"}
      </button>
      <p className="text-studio-muted w-full text-xs">
        The tier describes the physical document only. It says nothing about
        whether the work is anchored on a blockchain — that is tracked
        separately above.
      </p>
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * The minting path for one work (Bible section 10 Part 1 / 14). A plain
 * select that saves on change; no payment is taken here (see
 * `setCertificationPath`'s shortcut note), so the labels state the price
 * without implying it has been charged.
 */
const CERTIFICATION_PATHS = [
  { value: "lazy", label: "Lazy mint — free, anchored on the next trigger" },
  { value: "polygon", label: "Polygon zkEVM certificate — ₹499, immediate" },
  { value: "base_nft", label: "Base NFT (ERC-721) — ₹299, immediate and tradeable" },
] as const;

export function CertificationPathPicker({
  artworkId,
  current,
}: {
  artworkId: string;
  current: string;
}) {
  const [path, setPath] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <label className="text-studio-muted mt-3 flex flex-col gap-1 text-xs">
      Minting path
      <select
        aria-label="Minting path"
        className="studio-input"
        value={path}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as (typeof CERTIFICATION_PATHS)[number]["value"];
          const previous = path;
          setPath(next);
          setError(null);
          start(async () => {
            try {
              const result = await setCertificationPath(artworkId, next);
              if (!result.ok) {
                setPath(previous);
                setError(result.error);
              }
            } catch {
              setPath(previous);
              setError("Could not save that. Try again.");
            }
          });
        }}
      >
        {CERTIFICATION_PATHS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-red-600">
          {error}
        </span>
      )}
    </label>
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
              const result = await revokeCertificate(certId, reason.trim());
              if (!result.ok) setError(result.error);
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
