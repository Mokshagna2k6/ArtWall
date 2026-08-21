import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay (F17).
 *
 * Hand-rolled against Razorpay's REST API rather than pulling in their SDK: we
 * need exactly two calls (create an order, verify a webhook) and the SDK would
 * add a dependency to do less than this file does.
 *
 * The integration is **feature-flagged on the presence of keys**. With no keys
 * configured the wall still works end to end — an admin marks a booking paid,
 * which writes the same payment and ledger rows the webhook would. That is what
 * makes the flow testable before the merchant account exists, and it is a real
 * path (a bank transfer or cash payment needs recording too), not a stub.
 */

const API = "https://api.razorpay.com/v1";

export function isRazorpayConfigured(): boolean {
  return Boolean(
    process.env.RAZORPAY_KEY_ID &&
      process.env.RAZORPAY_KEY_SECRET &&
      process.env.RAZORPAY_WEBHOOK_SECRET
  );
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

/**
 * Create an order. Razorpay speaks paise, which is what we already store.
 *
 * `receipt` carries our booking id so a payment can always be traced back even
 * if a webhook arrives with nothing else we recognise.
 */
export async function createOrder(
  bookingId: string,
  amountPaise: number
): Promise<RazorpayOrder> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");

  const response = await fetch(`${API}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt: bookingId,
      notes: { bookingId },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Razorpay order failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as RazorpayOrder;
}

/**
 * Is this webhook genuinely from Razorpay?
 *
 * HMAC-SHA256 over the **raw** request body with the webhook secret. The body
 * must be the exact bytes received — re-serialising parsed JSON reorders keys
 * and changes whitespace, and the signature will not match. That is why the
 * route reads `request.text()` before it reads `request.json()`.
 *
 * Compared in constant time, for the same reason session tokens are.
 */
export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

/**
 * Issue a refund on a captured payment.
 *
 * Razorpay supports partial refunds; we always pass an explicit amount so the
 * refund matches the policy calculation rather than defaulting to a full refund.
 *
 * Idempotency: Razorpay's refund endpoint is NOT idempotent — calling it twice
 * creates two refunds. The caller must guard against double-invocation via the
 * ledger's source_ref unique index.
 */
export async function createRefund(
  paymentId: string,
  amountPaise: number,
  bookingId: string
): Promise<RazorpayRefund> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");

  const response = await fetch(`${API}/payments/${paymentId}/refund`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      amount: amountPaise,
      notes: { bookingId, reason: "admin_force_release" },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Razorpay refund failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as RazorpayRefund;
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null
): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = Buffer.from(
    createHmac("sha256", secret).update(rawBody).digest("hex")
  );
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
