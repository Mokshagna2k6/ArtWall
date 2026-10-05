import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BE-2.01: the Razorpay webhook verifies X-Razorpay-Signature over the RAW body
 * before anything else happens. Settlement is mocked: the assertion is that it
 * is reached only with a valid signature, and never for anything else.
 */
const settle = vi.hoisted(() => vi.fn(async () => "settled"));
vi.mock("@/features/physical-wall/settlement", () => ({ settleFromWebhook: settle }));
const alertAdmins = vi.hoisted(() => vi.fn(async (_key: string, _subject: string, _body: string) => {}));
vi.mock("@/features/physical-wall/notifications", () => ({ alertAdmins }));
const sql = vi.hoisted(() => vi.fn(async () => [{ "?column?": 1 }]));
vi.mock("@/lib/db", () => ({ getSql: () => sql }));

process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_unit";
const { POST, GET } = await import("@/app/api/physical-wall/razorpay/webhook/route");

const sign = (body: string, secret = "whsec_unit") => createHmac("sha256", secret).update(body).digest("hex");

function captured(extra: Record<string, unknown> = {}, eventExtra: Record<string, unknown> = {}) {
  return JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: { id: "pay_1", order_id: "order_1", amount: 11800, currency: "INR", notes: { bookingId: "bk_1" }, ...extra },
      },
    },
    ...eventExtra,
  });
}

function post(body: string, headers: Record<string, string> = {}) {
  return POST(new Request("http://x/api/physical-wall/razorpay/webhook", { method: "POST", body, headers }));
}

beforeEach(() => {
  settle.mockClear();
  alertAdmins.mockClear();
});

describe("Razorpay webhook signature (BE-2.01)", () => {
  it("valid signature → settles, keyed on x-razorpay-event-id", async () => {
    const body = captured();
    const res = await post(body, { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "settled" });
    expect(settle).toHaveBeenCalledWith({
      bookingId: "bk_1",
      eventId: "evt_1",
      paymentId: "pay_1",
      orderId: "order_1",
      amountPaise: 11800,
    });
  });

  it("missing signature → 401, nothing processed", async () => {
    const res = await post(captured());
    expect(res.status).toBe(401);
    expect(settle).not.toHaveBeenCalled();
  });

  it("invalid signature (wrong secret, truncated, other body) → 401, nothing processed", async () => {
    const body = captured();
    for (const signature of [sign(body, "someone-else"), sign(body).slice(0, 10), sign(captured({ amount: 1 })), "", "zz"]) {
      const res = await post(body, { "x-razorpay-signature": signature });
      expect(res.status, signature).toBe(401);
    }
    expect(settle).not.toHaveBeenCalled();
  });

  it("signature is over the raw bytes: re-serialised JSON with the same content is rejected", async () => {
    const body = captured();
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    const res = await post(pretty, { "x-razorpay-signature": sign(body) });
    expect(res.status).toBe(401);
    // …and the exact bytes, whitespace included, are accepted.
    expect((await post(pretty, { "x-razorpay-signature": sign(pretty) })).status).toBe(200);
  });

  it("no webhook secret configured → every request is rejected (fails closed)", async () => {
    const saved = process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    try {
      const body = captured();
      expect((await post(body, { "x-razorpay-signature": sign(body) })).status).toBe(401);
    } finally {
      process.env.RAZORPAY_WEBHOOK_SECRET = saved;
    }
    expect(settle).not.toHaveBeenCalled();
  });

  it("signed but not a capture, or wrong currency → not settled", async () => {
    const failed = JSON.stringify({ event: "payment.failed", payload: {} });
    expect(await (await post(failed, { "x-razorpay-signature": sign(failed) })).json()).toEqual({ ignored: "payment.failed" });
    const usd = captured({ currency: "USD" });
    expect((await post(usd, { "x-razorpay-signature": sign(usd) })).status).toBe(400);
    expect(settle).not.toHaveBeenCalled();
  });

  it("settlement throwing → 500 and admins are alerted (PERF-3.01)", async () => {
    settle.mockRejectedValueOnce(new Error("db unavailable"));
    const body = captured();
    const res = await post(body, { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_2" });
    expect(res.status).toBe(500);
    expect(alertAdmins).toHaveBeenCalledTimes(1);
    expect(alertAdmins.mock.calls[0][0]).toBe("webhook.razorpay.failed:pay_1");
  });
});

describe("Razorpay webhook replay window (SEC-2.14)", () => {
  it("accepts a payload whose created_at is within the window", async () => {
    const body = captured({}, { created_at: Math.floor(Date.now() / 1000) });
    const res = await post(body, { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_fresh" });
    expect(res.status).toBe(200);
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("rejects a validly-signed payload whose created_at is far in the past (replay)", async () => {
    const body = captured({}, { created_at: Math.floor(Date.now() / 1000) - 3600 });
    const res = await post(body, { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_old" });
    expect(res.status).toBe(401);
    expect(settle).not.toHaveBeenCalled();
  });

  it("rejects a validly-signed payload whose created_at is far in the future", async () => {
    const body = captured({}, { created_at: Math.floor(Date.now() / 1000) + 3600 });
    const res = await post(body, { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_future" });
    expect(res.status).toBe(401);
    expect(settle).not.toHaveBeenCalled();
  });

  it("has no created_at field (older/synthetic payload) → window check is skipped, event still settles", async () => {
    const body = captured();
    const res = await post(body, { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_nocreatedat" });
    expect(res.status).toBe(200);
    expect(settle).toHaveBeenCalledTimes(1);
  });
});

describe("Razorpay webhook health check (PERF-3.02)", () => {
  it("ok when the database is reachable and config is present", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("503 when the database is unreachable", async () => {
    sql.mockImplementationOnce(async () => {
      throw new Error("connection refused");
    });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "down", reason: "database" });
  });

  it("503 when the webhook secret is not configured", async () => {
    const saved = process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    try {
      const res = await GET();
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ status: "down", reason: "config" });
    } finally {
      process.env.RAZORPAY_WEBHOOK_SECRET = saved;
    }
  });
});
