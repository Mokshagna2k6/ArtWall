import { processOpenRefunds } from "@/features/physical-wall/refunds";
import { runCron } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Retry refunds that are pending, failed, or stuck mid-flight (BE-1.14); alert on stuck ones (BE-2.11). */
export async function GET(request: Request) {
  return runCron("refunds", request, async () => {
    const r = await processOpenRefunds();
    return { ...r, refunded: r.processed, processed: r.scanned, errors: r.failed };
  });
}
