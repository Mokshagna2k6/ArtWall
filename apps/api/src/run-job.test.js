import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { JOBS } from "./jobs.js";
import { runJob } from "./run-job.js";

const config = { webAppUrl: "https://example.test", cronSecret: "s3cret" };
const job = { name: "test-job", path: "/api/cron/test" };

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("JOBS", () => {
  it("covers the seven jobs vercel.json used to schedule", () => {
    assert.equal(JOBS.length, 7);
  });

  it("has a unique name and path per job", () => {
    assert.equal(new Set(JOBS.map((j) => j.name)).size, JOBS.length);
    assert.equal(new Set(JOBS.map((j) => j.path)).size, JOBS.length);
  });

  it("points every path at a real cron route", () => {
    for (const { path } of JOBS) {
      assert.match(path, /^\/api\/(cron|blockchain\/cron)\/[a-z-]+$/);
    }
  });

  it("gives every job a five-field cron expression", () => {
    for (const { name, schedule } of JOBS) {
      assert.equal(schedule.trim().split(/\s+/).length, 5, `${name}: ${schedule}`);
    }
  });
});

describe("runJob", () => {
  it("sends the cron secret as a bearer token", async () => {
    /** @type {{ url: unknown, headers: Record<string, string> } | undefined} */
    let seen;
    globalThis.fetch = async (url, init) => {
      seen = { url, headers: /** @type {Record<string, string>} */ (init?.headers ?? {}) };
      return new Response("{}", { status: 200 });
    };

    await runJob(job, config);

    assert.ok(seen, "fetch was not called");
    assert.equal(seen.url, "https://example.test/api/cron/test");
    assert.equal(seen.headers.authorization, "Bearer s3cret");
  });

  it("does not double the slash when the base url has a trailing one", async () => {
    /** @type {unknown} */
    let seen;
    globalThis.fetch = async (url) => {
      seen = url;
      return new Response("{}", { status: 200 });
    };

    await runJob(job, { ...config, webAppUrl: "https://example.test/" });

    assert.equal(seen, "https://example.test/api/cron/test");
  });

  it("reports success with the attempt count", async () => {
    globalThis.fetch = async () => new Response('{"processed":3}', { status: 200 });

    const result = await runJob(job, config);

    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.attempt, 1);
  });

  it("retries a 5xx and succeeds on a later attempt", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls < 3
        ? new Response("upstream blew up", { status: 503 })
        : new Response("{}", { status: 200 });
    };

    const result = await runJob(job, config);

    assert.equal(result.ok, true);
    assert.equal(calls, 3);
  });

  it("does NOT retry a 4xx — a wrong secret stays wrong", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("Unauthorized", { status: 401 });
    };

    const result = await runJob(job, config);

    assert.equal(result.ok, false);
    assert.equal(calls, 1, "a 401 must not be retried");
    assert.match(result.error ?? "", /401/);
  });

  it("gives up after the attempt ceiling and reports the last error", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("ECONNREFUSED");
    };

    const result = await runJob(job, config);

    assert.equal(result.ok, false);
    assert.equal(calls, 3);
    assert.match(result.error ?? "", /ECONNREFUSED/);
  });
});
