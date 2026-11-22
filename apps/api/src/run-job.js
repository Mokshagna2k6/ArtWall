/**
 * Call one job's endpoint on the web app, with retries and structured logs.
 *
 * The log shape deliberately mirrors `runCron` in
 * `apps/web/src/lib/cron.ts` (`event: "cron.start" | "cron.end" | "cron.error"`,
 * with `job` and `durationMs`), so a single query across both services' logs
 * returns one timeline instead of two formats to reconcile.
 *
 * Alerting is NOT duplicated here. `runCron` on the web side already alerts
 * admins through the deduped `alertAdmins` queue when a handler throws. This
 * service only alerts on failures the handler never saw — it was unreachable,
 * or it refused the request — which are exactly the failures `runCron` cannot
 * report, because it never ran.
 */

/** Per-attempt ceiling. The retention sweep is the long one; 10 min is well clear of it. */
const TIMEOUT_MS = 10 * 60 * 1000;

/** Total attempts per tick, with exponential backoff between them. */
const MAX_ATTEMPTS = 3;

/**
 * @param {{ name: string, path: string }} job
 * @param {{ webAppUrl: string, cronSecret: string }} config
 */
export async function runJob(job, config) {
  const url = `${config.webAppUrl.replace(/\/$/, "")}${job.path}`;
  const started = Date.now();

  console.info(JSON.stringify({ event: "cron.start", job: job.name, at: new Date(started).toISOString() }));

  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { authorization: `Bearer ${config.cronSecret}` },
        signal: controller.signal,
      });

      const body = await response.text();

      if (response.ok) {
        const durationMs = Date.now() - started;
        console.info(
          JSON.stringify({ event: "cron.end", job: job.name, ok: true, durationMs, attempt, body: truncate(body) })
        );
        return { ok: true, status: response.status, durationMs, attempt, at: new Date(started).toISOString() };
      }

      lastError = `HTTP ${response.status}: ${truncate(body)}`;

      // 4xx is a configuration fault, not a transient one — a wrong
      // CRON_SECRET returns 401 and will return 401 forever. Retrying it
      // wastes three attempts and delays the alert that says what is wrong.
      if (response.status >= 400 && response.status < 500) {
        break;
      }
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.name === "AbortError"
            ? `Timed out after ${TIMEOUT_MS}ms`
            : error.message
          : String(error);
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < MAX_ATTEMPTS) {
      const backoff = 2 ** (attempt - 1) * 5000;
      await sleep(backoff);
    }
  }

  const durationMs = Date.now() - started;
  console.error(
    JSON.stringify({ event: "cron.error", job: job.name, ok: false, durationMs, error: lastError })
  );

  return { ok: false, error: lastError, durationMs, at: new Date(started).toISOString() };
}

/**
 * Keep a log line readable; a handler returning HTML would otherwise dump a page.
 * @param {string} text
 * @param {number} [max]
 */
function truncate(text, max = 500) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
