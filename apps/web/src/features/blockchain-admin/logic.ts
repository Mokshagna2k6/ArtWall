/** Pure classifiers for the Blockchain Admin pages. No I/O, so they are unit-tested. */

export type PinState = "pinned" | "partial" | "unpinned";

/** A certificate's IPFS state from the two CIDs the mint flow writes (0014). */
export function ipfsPinState(c: { imageCid: string | null; metadataCid: string | null }): PinState {
  if (c.imageCid && c.metadataCid) return "pinned";
  if (c.imageCid || c.metadataCid) return "partial";
  return "unpinned";
}

export type MintHealth = "ok" | "stuck" | "failed" | "not_started";

/** `minting` longer than `stuckAfterMs` is stuck; the reconcile cron should clear it. */
export function mintHealth(
  c: { status: string; mintRequestedAt: Date | null },
  now: Date,
  stuckAfterMs = 30 * 60 * 1000,
): MintHealth {
  if (c.status === "failed") return "failed";
  if (c.status === "minting") {
    const age = c.mintRequestedAt ? now.getTime() - c.mintRequestedAt.getTime() : Infinity;
    return age > stuckAfterMs ? "stuck" : "ok";
  }
  if (c.status === "minted") return "ok";
  return "not_started";
}

/** Wallet addresses linked to more than one artist profile (compare case-insensitively). */
export function duplicateWallets(
  rows: { userId: string; walletAddress: string | null }[],
): { walletAddress: string; userIds: string[] }[] {
  const by = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.walletAddress) continue;
    const k = r.walletAddress.toLowerCase();
    by.set(k, [...(by.get(k) ?? []), r.userId]);
  }
  return [...by.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([walletAddress, userIds]) => ({ walletAddress, userIds }));
}

/** Escrow totals by hold status. */
export function escrowTotals(holds: { status: string; amountPaise: number }[]) {
  const t = { held: 0, released: 0, refunded: 0, heldCount: 0 };
  for (const h of holds) {
    if (h.status === "held") {
      t.held += h.amountPaise;
      t.heldCount += 1;
    } else if (h.status === "released") t.released += h.amountPaise;
    else if (h.status === "refunded") t.refunded += h.amountPaise;
  }
  return t;
}

/** A hold past its dispute window that nobody has released or refunded. */
export function isOverdueHold(
  h: { status: string; releaseEligibleAt: Date | null },
  now: Date,
): boolean {
  return h.status === "held" && !!h.releaseEligibleAt && h.releaseEligibleAt.getTime() < now.getTime();
}
