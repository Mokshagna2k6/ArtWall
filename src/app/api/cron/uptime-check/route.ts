import { runCron } from "@/lib/cron";
import { alertAdmins } from "@/features/physical-wall/notifications";
import { siteConfig } from "@/config/site";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Uptime checks, with alerting (PERF-3.02).
 *
 * The four surfaces docs/incident-runbook.md's "Uptime checks" section asks
 * an external monitor to poll. This cron is a genuine, self-contained second
 * layer this project can actually run with zero external account: it polls
 * the same four endpoints and pages admins (via the existing `alertAdmins`
 * queue, same as every other cron job in this directory) on failure.
 *
 * Cadence ceiling: Vercel Hobby only allows daily cron schedules (every
 * existing entry in vercel.json is `* * *` daily — a constraint this project
 * has hit before). That means this job can only ever catch an outage once a
 * day, not within minutes. A real external uptime monitor (UptimeRobot/
 * Better Stack, polling every 1-5 min) is still genuinely necessary for fast
 * detection and is NOT replaced by this cron - this is a free daily backstop
 * that pages admins even if nobody ever configures that external monitor,
 * not a substitute for one. docs/incident-runbook.md documents both layers.
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? siteConfig.url;

const TARGETS = [
  { name: "home", path: "/" },
  { name: "marketplace", path: "/discover" },
  { name: "verify", path: "/verify" },
  { name: "razorpay-webhook", path: "/api/physical-wall/razorpay/webhook" },
] as const;

async function checkOne(path: string): Promise<{ ok: boolean; status: number | null; error?: string }> {
  try {
    const res = await fetch(new URL(path, BASE_URL), {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    // The webhook's own GET health check reports 503 on a real dependency
    // failure (see its route comment) - anything else 2xx/3xx counts as up.
    return { ok: res.status < 400, status: res.status };
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function GET(request: Request) {
  return runCron("uptime-check", request, async () => {
    const results = await Promise.all(
      TARGETS.map(async (t) => ({ ...t, ...(await checkOne(t.path)) }))
    );
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      await alertAdmins(
        `uptime-check.failed:${today}`,
        `Uptime check failed: ${failed.map((f) => f.name).join(", ")}`,
        failed
          .map((f) => `${f.name} (${f.path}): status=${f.status ?? "no response"}${f.error ? `, error=${f.error}` : ""}`)
          .join("\n")
      );
    }
    return { processed: results.length, errors: failed.length, results };
  });
}
