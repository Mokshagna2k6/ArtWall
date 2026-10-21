import { createServer } from "node:http";

import { Cron } from "croner";

import { JOBS } from "./jobs.js";
import { runJob } from "./run-job.js";

/**
 * Railway scheduler.
 *
 * Replaces Vercel Cron for the seven jobs in jobs.js. It owns only the timing;
 * each job's implementation stays in `apps/web` behind the same HTTP endpoint
 * it already had (see jobs.js for why).
 *
 * The HTTP server exists because Railway health-checks a port and will restart
 * a service that does not answer. It also gives somewhere to read schedule
 * state from, and a manual trigger for operators.
 */

const PORT = Number(process.env.PORT ?? 8080);

const WEB_APP_URL = process.env.WEB_APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;
const TIMEZONE = process.env.CRON_TZ ?? "Asia/Kolkata";

// Fail fast and loudly. A scheduler that starts without these looks healthy
// while silently doing nothing, which is the worst possible failure here —
// every job would 401 and nobody would notice until a refund was missed.
//
// Read into consts above and checked individually (rather than looping over a
// config object) so the narrowing holds for the rest of the file.
const missing = [
  ["WEB_APP_URL", WEB_APP_URL],
  ["CRON_SECRET", CRON_SECRET],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (!WEB_APP_URL || !CRON_SECRET) {
  console.error(
    JSON.stringify({
      event: "scheduler.misconfigured",
      missing,
      message: "Refusing to start: every job would fail authorization.",
    })
  );
  process.exit(1);
}

/** @type {{ webAppUrl: string, cronSecret: string }} */
const config = { webAppUrl: WEB_APP_URL, cronSecret: CRON_SECRET };

/** Last outcome per job, surfaced at GET /status for operators. */
const lastRun = new Map();

// `protect: true`: if a run is still going when the next tick arrives, the
// overlapping tick is skipped rather than started alongside. These jobs write
// to shared tables and are not written to be concurrency-safe against
// themselves — two retention sweeps at once is a real hazard.
const tasks = JOBS.map(
  (job) =>
    new Cron(job.schedule, { name: job.name, timezone: TIMEZONE, protect: true }, async () => {
      lastRun.set(job.name, await runJob(job, config));
    })
);

console.info(
  JSON.stringify({
    event: "scheduler.start",
    jobs: JOBS.length,
    timezone: TIMEZONE,
    target: config.webAppUrl,
  })
);

const server = createServer(
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   */
  async (request, response) => {
    const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);

    // Railway's health check.
    if (url.pathname === "/health") {
      return json(response, 200, { ok: true });
    }

    if (url.pathname === "/status") {
      return json(response, 200, {
        timezone: TIMEZONE,
        jobs: JOBS.map((job, index) => ({
          name: job.name,
          schedule: job.schedule,
          nextRun: tasks[index].nextRun()?.toISOString() ?? null,
          lastRun: lastRun.get(job.name) ?? null,
        })),
      });
    }

    // Manual trigger, for re-running a job that failed without waiting a day.
    // Guarded by the same CRON_SECRET the jobs themselves use: this endpoint
    // can move money (refunds) and delete data (retention), so it is never open.
    if (url.pathname.startsWith("/trigger/") && request.method === "POST") {
      if (!authorized(request)) {
        return json(response, 401, { error: "Unauthorized" });
      }
      const name = url.pathname.slice("/trigger/".length);
      const job = JOBS.find((candidate) => candidate.name === name);
      if (!job) return json(response, 404, { error: "No such job" });

      const result = await runJob(job, config);
      lastRun.set(job.name, result);
      return json(response, result.ok ? 200 : 502, result);
    }

    return json(response, 404, { error: "Not found" });
  }
);

server.listen(PORT, () => {
  console.info(JSON.stringify({ event: "scheduler.listening", port: PORT }));
});

/**
 * Timing-safe-enough comparison for the trigger endpoint.
 *
 * Length is compared first and the loop is constant-time over equal-length
 * inputs, so a wrong secret leaks no positional information. The web app uses
 * `safeEqual` from @artwall/security for the same purpose; that package is
 * TypeScript source meant for the Next.js bundler, so this service keeps its
 * own copy rather than pulling a transpile step into a plain-Node deploy.
 *
 * @param {import("node:http").IncomingMessage} request
 */
function authorized(request) {
  const expected = `Bearer ${config.cronSecret}`;
  const actual = request.headers.authorization ?? "";
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return diff === 0;
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {unknown} body
 */
function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

// Railway sends SIGTERM on redeploy. Stop taking new ticks, let an in-flight
// job finish, then exit — a refund sweep killed mid-run is worse than a late one.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.info(JSON.stringify({ event: "scheduler.stopping", signal }));
    for (const task of tasks) task.stop();
    server.close(() => process.exit(0));
  });
}
