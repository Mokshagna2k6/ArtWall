import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Fails closed: with no
 * secret configured, `Bearer undefined` must not be a valid credential.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Run a cron job with structured logs (BE-2.27): one JSON line at start, one at
 * end with duration and processed count, or one with the error. `processed` is
 * what the job reports as the work it did; the rest of its result is returned
 * as the response body. The error text is logged, never returned.
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
    console.error(
      JSON.stringify({
        event: "cron.error",
        job,
        ok: false,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return Response.json({ error: "Cron job failed. See logs." }, { status: 500 });
  }
}
