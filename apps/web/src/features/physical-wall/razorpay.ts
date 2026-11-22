import "server-only";

import { verifyHmacSha256 } from "@artwall/security";

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

async function razorpay<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");

  const response = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new RazorpayApiError(response.status, `Razorpay ${init?.method ?? "GET"} ${path.split("?")[0]} failed (${response.status}): ${detail}`);
  }
  return (await response.json()) as T;
}

export class RazorpayApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "RazorpayApiError";
  }
}

export function isRazorpayConfigured(): boolean {
  return Boolean(
    process.env.RAZORPAY_KEY_ID &&
      process.env.RAZORPAY_KEY_SECRET &&
      process.env.RAZORPAY_WEBHOOK_SECRET
  );
}

export function validateRazorpayConfig(): void {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (keyId && keySecret && !webhookSecret) {
    throw new Error(
      "RAZORPAY_WEBHOOK_SECRET is missing. Set it before accepting live payments."
    );
  }
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
  if (!Number.isInteger(amountPaise) || amountPaise < 100) {
    throw new Error(`Refusing to create an order for ${amountPaise} paise`);
  }
  return razorpay<RazorpayOrder>("/orders", {
    method: "POST",
    body: {
      amount: amountPaise,
      currency: "INR",
      receipt: bookingId,
      // Capture on authorisation: a booking is confirmed on capture only.
      payment_capture: 1,
      notes: { bookingId },
    },
  });
}

/**
 * Marketplace checkout order (one payment for the whole cart, however many
 * sellers). `notes.orderId` is what the shared webhook dispatches on; the
 * booking flow keeps using `notes.bookingId`, untouched.
 */
export async function createMarketplaceOrder(
  orderId: string,
  receipt: string,
  amountPaise: number
): Promise<RazorpayOrder> {
  if (!Number.isInteger(amountPaise) || amountPaise < 100) {
    throw new Error(`Refusing to create an order for ${amountPaise} paise`);
  }
  return razorpay<RazorpayOrder>("/orders", {
    method: "POST",
    body: {
      amount: amountPaise,
      currency: "INR",
      receipt,
      payment_capture: 1,
      notes: { orderId, kind: "marketplace" },
    },
  });
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  notes?: { bookingId?: string; orderId?: string } | [];
}

export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  return razorpay<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export async function fetchOrder(orderId: string): Promise<RazorpayOrder & { status: string; amount_paid: number }> {
  return razorpay(`/orders/${encodeURIComponent(orderId)}`);
}

/**
 * Checkout success callback signature: HMAC-SHA256 of "order_id|payment_id"
 * with the key secret (not the webhook secret). Constant-time compare.
 */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!orderId || !paymentId) return false;
  return verifyHmacSha256(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`, signature);
}

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
 * creates two refunds. Only refunds.ts calls this, after claiming the pw_refunds
 * row and after findRefund() has confirmed no refund with this refundId exists.
 */
export async function createRefund(
  paymentId: string,
  amountPaise: number,
  refs: { refundId: string; bookingId?: string; orderId?: string }
): Promise<RazorpayRefund> {
  return razorpay<RazorpayRefund>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: { amount: amountPaise, receipt: refs.refundId, notes: refs },
  });
}

/**
 * The refund we already issued for this pw_refunds row, if any. Razorpay
 * refunds are not idempotent, so a retry must look before it creates.
 */
export async function findRefund(paymentId: string, refundId: string): Promise<RazorpayRefund | null> {
  const list = await razorpay<{ items: (RazorpayRefund & { notes?: { refundId?: string } | [] })[] }>(
    `/payments/${encodeURIComponent(paymentId)}/refunds?count=100`
  );
  return list.items.find((r) => !Array.isArray(r.notes) && r.notes?.refundId === refundId) ?? null;
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
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null
): boolean {
  return verifyHmacSha256(process.env.RAZORPAY_WEBHOOK_SECRET, rawBody, signature);
}

