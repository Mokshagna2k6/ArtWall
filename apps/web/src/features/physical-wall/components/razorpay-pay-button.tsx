"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  getBookingPaymentStatus,
  startPayment,
  verifyPayment,
} from "@/features/physical-wall/actions/payment";
import { IDLE } from "@/features/physical-wall/action-state";

type RazorpayResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open(): void;
  on(
    event: "payment.failed",
    cb: (r: { error?: { description?: string } }) => void
  ): void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Razorpay Checkout."));
    document.body.appendChild(s);
  });
}

type Phase =
  | { kind: "idle" }
  /** Order being created, Checkout open, or verify in flight. */
  | { kind: "busy"; message: string }
  /** Money has (probably) moved and the server hasn't confirmed yet. No retry offered. */
  | { kind: "confirming"; message: string }
  | { kind: "retry"; message: string }
  | { kind: "paid"; message: string };

const POLL_MS = 3_000;
const POLL_TRIES = 40; // two minutes

/**
 * Pay for a held booking (FE-1.04..06): server creates the order, Checkout takes
 * the money, the server verifies the signature and settles. The booking only
 * reads "paid" after the server says so; dismissing or failing Checkout leaves
 * it held and offers another go.
 *
 * Double-pay guards (FE-2.02): the button is disabled for the whole
 * order -> Checkout -> verify cycle, a ref blocks a second click that lands
 * before React re-renders, and the server reuses an open order anyway.
 *
 * Webhook race (FE-2.03): the webhook can settle the booking before (or
 * instead of) the client verify. Whenever verify doesn't return a definite
 * "paid", the button polls the booking's own status until it does, so a paid
 * booking is never left looking unpaid, and "try again" is only offered once
 * the server still says the booking is held.
 */
export function RazorpayPayButton({
  bookingId,
  label,
  prefill,
}: {
  bookingId: string;
  label: string;
  prefill?: { name?: string; email?: string };
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const inFlight = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function settle(next: Phase) {
    if (!alive.current) return;
    setPhase(next);
    if (next.kind === "retry") inFlight.current = false;
  }

  function markPaid(message: string) {
    settle({ kind: "paid", message });
    router.refresh();
  }

  /** Ask the server until the booking reads paid, or until we give up. */
  async function waitForPaid(fallback: Phase) {
    settle({
      kind: "confirming",
      message:
        "Payment received. Confirming your booking — don't pay again, this updates by itself.",
    });
    for (let i = 0; i < POLL_TRIES && alive.current; i++) {
      const current = await getBookingPaymentStatus(bookingId).catch(() => null);
      if (current?.status === "paid" || current?.status === "completed") {
        markPaid("Payment confirmed. Your booking is paid.");
        return;
      }
      if (current && current.status !== "held") {
        // Cancelled/expired/refunded while we waited: show the server's truth.
        settle(fallback);
        router.refresh();
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    settle({
      kind: "confirming",
      message:
        "Your payment is still being confirmed. You don't need to pay again — reload this page in a few minutes. If it isn't confirmed, it is refunded automatically.",
    });
  }

  async function pay() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase({ kind: "busy", message: "Creating your order…" });
    try {
      const form = new FormData();
      form.set("bookingId", bookingId);
      const order = await startPayment(IDLE, form);
      if (order.status !== "ok") {
        settle({
          kind: "retry",
          message:
            order.status === "error"
              ? order.message
              : "Could not start payment.",
        });
        return;
      }
      const { orderId, amount, currency, keyId, status } = order.data as {
        orderId: string;
        amount: number;
        currency: string;
        keyId: string;
        status?: string;
      };
      if (status === "paid") {
        markPaid(order.message);
        return;
      }
      if (!keyId) throw new Error("Payments are misconfigured (no key id).");

      await loadCheckout();
      settle({
        kind: "busy",
        message: "Complete the payment in the Razorpay window…",
      });

      let handled = false;
      const rzp = new window.Razorpay!({
        key: keyId,
        order_id: orderId,
        amount,
        currency,
        name: "ArtWall",
        description: "Physical wall booking",
        prefill,
        handler: async (response: RazorpayResponse) => {
          handled = true;
          settle({ kind: "busy", message: "Confirming your payment…" });
          const result = await verifyPayment(response).catch(() => null);
          const verifiedStatus =
            result?.status === "ok"
              ? (result.data as { status?: string } | undefined)?.status
              : undefined;
          if (result?.status === "ok" && verifiedStatus === "paid") {
            markPaid(result.message);
            return;
          }
          // Pending capture, a network failure, or an error the webhook may
          // still overturn: the server's booking status decides.
          await waitForPaid({
            kind: "retry",
            message:
              result?.status === "error"
                ? result.message
                : "We couldn't confirm the payment. If money left your account it will be confirmed or refunded automatically.",
          });
        },
        modal: {
          ondismiss: () => {
            if (handled) return;
            settle({
              kind: "retry",
              message:
                "Payment cancelled. Your slots are still held — you can try again.",
            });
            // Return focus to the control that opened the modal (FE-2.18).
            requestAnimationFrame(() => buttonRef.current?.focus());
          },
        },
      });
      rzp.on("payment.failed", (r) => {
        // Checkout stays open so the artist can retry inside it; the button
        // remains locked until the modal is dismissed.
        if (!alive.current) return;
        setPhase({
          kind: "busy",
          message: `Payment failed${r.error?.description ? `: ${r.error.description}` : ""}. Try another method in the Razorpay window, or close it — your slots are still held.`,
        });
      });
      rzp.open();
    } catch (error) {
      settle({
        kind: "retry",
        message:
          error instanceof Error ? error.message : "Could not start payment.",
      });
    }
  }

  const locked = phase.kind === "busy" || phase.kind === "confirming";

  return (
    <div className="mt-4 flex flex-col gap-3">
      {phase.kind !== "paid" && phase.kind !== "confirming" && (
        <button
          ref={buttonRef}
          type="button"
          onClick={pay}
          disabled={locked}
          aria-busy={locked}
          data-testid="pay-button"
          className="text-small bg-ember text-wall-paper hover:bg-ember-glow inline-flex h-10 items-center justify-center gap-2 rounded-md border border-transparent px-4 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase.kind === "retry" ? `Try again · ${label}` : label}
        </button>
      )}
      <p
        role={phase.kind === "retry" ? "alert" : "status"}
        aria-live={phase.kind === "retry" ? "assertive" : "polite"}
        data-testid="pay-status"
        data-phase={phase.kind}
        className={`text-sm ${phase.kind === "idle" ? "sr-only" : ""} ${phase.kind === "retry" ? "text-destructive" : phase.kind === "paid" ? "text-signal" : "text-ink-muted"}`}
      >
        {phase.kind === "idle" ? "" : phase.message}
      </p>
    </div>
  );
}
