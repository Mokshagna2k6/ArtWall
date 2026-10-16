import "server-only";

import { db } from "@/lib/db/index";
import { demandSignals } from "@/lib/db/schema";

/**
 * Writing demand signals (Bible §14, §42–45).
 *
 * The Demand Engine's aggregation job (`aggregate.ts`) and every public
 * ranking read from `demand_signals` / `demand_aggregates`, but until now
 * nothing in the app wrote a row — the table was only ever populated by
 * tests. Any user action the Bible lists as a signal has to land here or the
 * engine is starved of its inputs.
 *
 * Weights are the Bible's qualitative bands (§14) mapped onto the integer
 * scale migration 0045 already established (`view` = 1, `wishlist` = 3):
 *   LOW = 1 · MEDIUM = 3 · HIGH = 5
 * §43 says the weights are configurable; this is the default table until a
 * configuration surface exists.
 *
 * **Bible §44: a score, threshold or confidence figure must never reach a
 * public surface.** This module only ever writes. Nothing here returns a
 * score, so no caller can accidentally render one.
 */

/** Bible §14's signal list, with its weight band. Extend as signals are wired up. */
export const SIGNAL_WEIGHTS = {
  /** Artwork page view. LOW. */
  view: 1,
  /** QR scan of a physical tag. MEDIUM. */
  scan: 3,
  /** NFC tap. HIGH — hardest to fake, §45. */
  nfc_tap: 5,
  /** Save / wishlist. MEDIUM. */
  wishlist: 3,
  /** Share. LOW. */
  share: 1,
  /** Inquiry about a work — "purchase intent", MEDIUM (§14, CHANGES-PLAN §22.3). */
  inquiry: 3,
  /** Buy click. HIGH. */
  buy_click: 5,
  /** Offer made. HIGH. */
  offer: 5,
} as const;

export type SignalType = keyof typeof SIGNAL_WEIGHTS;

/**
 * Append one demand signal. Fire-and-forget by design: a signal is telemetry,
 * so a failure here must never fail the user action that produced it (an
 * inquiry that was really sent must not report an error because the demand
 * table was unreachable). Logged, never thrown.
 */
export async function recordDemandSignal(
  artworkId: string,
  signalType: SignalType,
  value = 1
): Promise<void> {
  try {
    await db.insert(demandSignals).values({
      artworkId,
      signalType,
      weight: SIGNAL_WEIGHTS[signalType],
      value,
    });
  } catch (error) {
    console.error(`[demand] failed to record ${signalType} for ${artworkId}`, error);
  }
}
