import type { TrustDimensionLevels } from "@/features/policy/trust";

/**
 * FE-3.01-3.04: the five independent trust dimensions (Bible section 3-11),
 * each with its own state — never collapsed into one status. Renders exactly
 * what {@link loadTrustDimensionLevels} returns; no eligibility logic lives
 * here, this is display-only (the PolicyEngine gates, not this panel, decide
 * what the data means for an action).
 */

const ARTIST_VERIFICATION_COPY: Record<string, string> = {
  unverified: "Not verified",
  pending: "Verification pending",
  approved: "Identity verified",
  rejected: "Verification rejected",
};

// FE-3.02: COA-0 shown explicitly, not blank. Bible sections 6-9 — these are
// holographic document tiers and say nothing about blockchain state (rule 7).
const COA_TIER_COPY: Record<number, string> = {
  0: "No COA",
  1: "Standard holographic",
  2: "Premium holographic",
  3: "Institutional",
};

// Mint progress of the certificate record itself (coa_level, 0046/0052). Shown
// under its own label: it is NOT the COA tier above, and conflating the two is
// the exact mistake Bible section 7 rule 7 forbids.
const COA_LEVEL_COPY: Record<number, string> = {
  0: "Not issued",
  1: "Issued",
  2: "Metadata pinned",
  3: "Minted on-chain",
};

// Bible section 10 Part 1 / 14.
const CERTIFICATION_PATH_COPY: Record<string, string> = {
  lazy: "Lazy mint (free, on first trigger)",
  polygon: "Polygon zkEVM certificate",
  base_nft: "Base L2 NFT (tradeable)",
};

// FE-3.03: P0-P4 with an explanation for each level.
const PROVENANCE_LEVEL_COPY: Record<number, string> = {
  0: "No provenance recorded",
  1: "Certificate of Authenticity issued",
  2: "Mint commitment opened",
  3: "Commitment confirmed on-chain",
  4: "Minted",
};

// FE-3.04: B0-B3 physical binding levels.
const BINDING_LEVEL_COPY: Record<number, string> = {
  0: "No tag bound",
  1: "Tag bound, no key reference",
  2: "Key reference on file",
  3: "Key reference + observed tap",
};

function Dimension({
  label,
  value,
  detail,
  ok,
}: {
  label: string;
  value: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <div className="border-hairline flex items-start justify-between gap-4 border-b py-3 last:border-b-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-ink-muted mt-0.5 text-xs">{detail}</p>
      </div>
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className={`h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-neutral-300"}`} />
        <span className="text-sm">{value}</span>
      </div>
    </div>
  );
}

export function TrustPanel({ levels }: { levels: TrustDimensionLevels }) {
  return (
    <section className="border-hairline mt-8 rounded-lg border p-5">
      <h2 className="text-xs font-medium tracking-wider uppercase">Trust &amp; provenance</h2>
      <div className="mt-3">
        <Dimension
          label="Artist verification"
          value={ARTIST_VERIFICATION_COPY[levels.artistVerificationStatus] ?? "Not verified"}
          detail="Identity confirmed by DigiLocker or manual review."
          ok={levels.artistVerificationStatus === "approved"}
        />
        <Dimension
          label={`Certificate of Authenticity — COA-${levels.coaTier}`}
          value={COA_TIER_COPY[levels.coaTier] ?? "No COA"}
          detail="0 to 3: holographic document tier. Implies nothing on-chain."
          ok={levels.coaTier >= 1}
        />
        <Dimension
          label="Certificate record"
          value={COA_LEVEL_COPY[levels.coaLevel] ?? "Not issued"}
          detail="Where the certificate itself is in the issue-and-mint flow."
          ok={levels.coaLevel >= 1}
        />
        <Dimension
          label={`Blockchain provenance — P${levels.provenanceLevel}`}
          value={PROVENANCE_LEVEL_COPY[levels.provenanceLevel] ?? "No provenance recorded"}
          detail="0 to 4: COA issuance through confirmed on-chain mint."
          ok={levels.provenanceLevel >= 3}
        />
        <Dimension
          label="Minting path"
          value={CERTIFICATION_PATH_COPY[levels.certificationPath] ?? "Lazy mint"}
          detail="Which certification route this work was registered through."
          // Informational: no path is "better", so no state is a failure.
          ok={levels.certificationPath !== "lazy"}
        />
        <Dimension
          label={`Physical binding — B${levels.bindingLevel}`}
          value={BINDING_LEVEL_COPY[levels.bindingLevel] ?? "No tag bound"}
          detail="0 to 3: NFC/QR tag binding and key verification."
          ok={levels.bindingLevel >= 2}
        />
        <Dimension
          label="Transaction eligibility"
          value={levels.transactionEligible ? "Eligible" : "Not yet eligible"}
          detail="Published, identity verified, and COA issued."
          ok={levels.transactionEligible}
        />
      </div>
    </section>
  );
}
