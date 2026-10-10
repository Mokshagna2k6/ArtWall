import { formatINR } from "@/features/physical-wall/money";
import type { EscrowSplitPreview } from "@/features/escrow/preview";

/**
 * FE-3.14: dual-channel escrow split display for a marketplace purchase's
 * checkout UI (artist share, platform commission, curator/venue share),
 * computed server-side by {@link loadEscrowSplitPreview} from the real
 * `computeEscrowSplit` — this component only renders the numbers it is
 * given, same display-only discipline as TrustPanel (src/features/policy/
 * trust-panel.tsx): no split math lives here, so a future real checkout flow
 * can mount this unchanged against the exact amount it is about to capture
 * into escrow.
 */

function Row({ label, amountPaise, detail }: { label: string; amountPaise: number; detail: string }) {
  return (
    <div className="border-hairline flex items-start justify-between gap-4 border-b py-3 last:border-b-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-ink-muted mt-0.5 text-xs">{detail}</p>
      </div>
      <span className="text-sm whitespace-nowrap">{formatINR(amountPaise)}</span>
    </div>
  );
}

export function EscrowSplitBreakdown({ split }: { split: EscrowSplitPreview }) {
  return (
    <section className="border-hairline mt-8 rounded-lg border p-5">
      <h2 className="text-xs font-medium tracking-wider uppercase">
        Payment split — commission policy v{split.commissionPolicyVersion}
      </h2>
      <div className="mt-3">
        <Row label="Artist share" amountPaise={split.artistPaise} detail="Paid out after delivery confirmation or the dispute window." />
        <Row label="Platform commission" amountPaise={split.platformPaise} detail="ArtWall's fee for this transaction." />
        {split.hasCuratorVenue && (
          <Row label="Curator / venue share" amountPaise={split.curatorVenuePaise} detail="This artwork is a curator pick." />
        )}
      </div>
      <p className="text-ink-muted mt-3 text-xs">
        Held in escrow until delivery is confirmed, then released per this split. Total: {formatINR(split.amountPaise)}.
      </p>
    </section>
  );
}
