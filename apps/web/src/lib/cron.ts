import "server-only";

import { safeEqual } from "@artwall/security";

import { alertAdmins } from "@/features/physical-wall/notifications";

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Fails closed: with no
 * secret configured, `Bearer undefined` must not be a valid credential.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(`Bearer ${secret}`, request.headers.get("authorization") ?? "");
}

/**
 * Run a cron job with structured logs (BE-2.27): one JSON line at start, one at
 * end with duration and processed count, or one with the error. `processed` is
 * what the job reports as the work it did; the rest of its result is returned
 * as the response body. The error text is logged, never returned.
 *
 * On failure, also alerts admins (PERF-3.01) via the existing `alertAdmins`
 * queue (Resend-backed, deduped by key) rather than a new
 * monitoring/error-tracking dependency — one alert per job PER RUN (keyed by
 * job + start timestamp), so a job that fails on every 5-minute tick doesn't
 * spam, but a run that fails after a prior run succeeded still pages someone.
 * Best-effort: alertAdmins swallows its own errors, so a mail outage never
 * turns a job failure into an unhandled rejection here.
 */
export async function runCron<T extends { processed: number }>(
  job: string,
  request: Request,
  fn: () => Promise<T>
): Promise<Response> {
  if (!isCronAuthorized(request)) {
    console.warn(JSON.stringify({ event: "cron.unauthorized", job }));
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  console.info(JSON.stringify({ event: "cron.start", job, at: new Date(started).toISOString() }));
  try {
    const result = await fn();
    console.info(
      JSON.stringify({ event: "cron.end", job, ok: true, durationMs: Date.now() - started, ...result })
    );
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        event: "cron.error",
        job,
        ok: false,
        durationMs: Date.now() - started,
        error: message,
      })
    );
    await alertAdmins(`cron.error:${job}:${started}`, `Cron job failed: ${job}`, `${job} failed at ${new Date(started).toISOString()}.\n\n${message}`);
    return Response.json({ error: "Cron job failed. See logs." }, { status: 500 });
  }
}

/**
 * When a cron's work loop must stop picking up new items (PERF-2.09): the
 * route's `maxDuration` minus headroom for the item in flight (each has its own
 * <=15s network timeout) and the response. Whatever is left over stays queued
 * and is picked up by the next run - every batch here is resumable.
 */
export function deadline(maxDurationS: number, headroomS = 20): number {
  return Date.now() + (maxDurationS - headroomS) * 1000;
}
