import { runCron } from "@/lib/cron";
import { runDemandAggregation } from "@/features/demand/aggregate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Demand Engine aggregation (PERF-3.04): runs `runDemandAggregation` on a
 * schedule instead of per request, same `runCron` pattern as every other job
 * in this directory. See `src/features/demand/aggregate.ts`'s module doc for
 * what it computes; this route is just the scheduled caller it was missing.
 */
export async function GET(request: Request) {
  return runCron("demand-aggregate", request, () => runDemandAggregation());
}
