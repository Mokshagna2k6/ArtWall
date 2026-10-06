import { afterEach, describe, expect, it, vi } from "vitest";

const { alertAdmins } = vi.hoisted(() => ({
  alertAdmins: vi.fn(async (_key: string, _subject: string, _body: string) => {}),
}));
vi.mock("@/features/physical-wall/notifications", () => ({ alertAdmins }));

import { runCron } from "@/lib/cron";

const req = (auth?: string) => new Request("http://x/api/cron/job", { headers: auth ? { authorization: auth } : {} });
const lines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.parse(String(c[0])));

describe("runCron structured logging (BE-2.27)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    alertAdmins.mockClear();
    delete process.env.CRON_SECRET;
  });

  it("logs start and end with duration and processed count", async () => {
    process.env.CRON_SECRET = "s3cret";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await runCron("refunds", req("Bearer s3cret"), async () => ({ processed: 3, errors: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 3, errors: 1 });
    const [start, end] = lines(info);
    expect(start).toMatchObject({ event: "cron.start", job: "refunds" });
    expect(end).toMatchObject({ event: "cron.end", job: "refunds", ok: true, processed: 3, errors: 1 });
    expect(typeof end.durationMs).toBe("number");
  });

  it("logs the error and returns a generic 500 (no error text in the response)", async () => {
    process.env.CRON_SECRET = "s3cret";
    vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runCron("merkle-root", req("Bearer s3cret"), async () => {
      throw new Error('relation "merkle_roots" does not exist');
    });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("merkle_roots");
    expect(lines(error)[0]).toMatchObject({ event: "cron.error", job: "merkle-root", ok: false, error: expect.stringContaining("merkle_roots") });
  });

  it("alerts admins on failure (PERF-3.01), deduped per job per run", async () => {
    process.env.CRON_SECRET = "s3cret";
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runCron("merkle-root", req("Bearer s3cret"), async () => {
      throw new Error("boom");
    });
    expect(alertAdmins).toHaveBeenCalledTimes(1);
    expect(alertAdmins.mock.calls[0][0]).toMatch(/^cron\.error:merkle-root:/);
  });

  it("refuses without the secret, and never runs the job", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const job = vi.fn(async () => ({ processed: 0 }));
    expect((await runCron("x", req("Bearer undefined"), job)).status).toBe(401);
    process.env.CRON_SECRET = "s3cret";
    expect((await runCron("x", req("Bearer wrong!"), job)).status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });
});
