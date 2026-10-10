import { features } from "@/config/site";
import { processOpenRefunds } from "@/features/physical-wall/refunds";
import { deadline, runCron } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Retry refunds that are pending, failed, or stuck mid-flight (BE-1.14); alert on stuck ones (BE-2.11).
 *
 * With marketplace checkout on, the same run also drains marketplace refunds
 * and runs the order sweep (lapse unpaid checkouts, refund orders the artist
 * never accepted, release escrow whose window has passed): one cron, not a new
 * one, because vercel.json already carries seven.
 */
export async function GET(request: Request) {
  return runCron("refunds", request, async () => {
    const until = deadline(maxDuration);
    const r = await processOpenRefunds(20, until);
    const result = { ...r, refunded: r.processed, processed: r.scanned, errors: r.failed };
    if (!features.marketplaceCheckout) return result;

    const { processOpenOrderRefunds } = await import("@/features/orders/refunds");
    const { runOrderSweep } = await import("@/features/orders/fulfilment");
    const orderRefunds = await processOpenOrderRefunds(20, until);
    const sweep = await runOrderSweep(until);
    return {
      ...result,
      processed: result.processed + orderRefunds.scanned + sweep.expired + sweep.timedOut + sweep.released,
      errors: result.errors + orderRefunds.failed + sweep.errors,
      orderRefunds,
      sweep,
    };
  });
}
