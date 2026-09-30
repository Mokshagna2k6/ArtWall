"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
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
  | { kind: "busy"; message: string }
  | { kind: "retry"; message: string }
  | { kind: "paid"; message: string };

/**
 * Pay for a held booking (FE-1.04..06): server creates the order, Checkout takes
 * the money, the server verifies the signature and settles. The booking only
 * reads "paid" after verifyPayment says so; dismissing or failing Checkout leaves
 * it held and offers another go.
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

  async function pay() {
    setPhase({ kind: "busy", message: "Creating your order…" });
    try {
      const form = new FormData();
      form.set("bookingId", bookingId);
      const order = await startPayment(IDLE, form);
      if (order.status !== "ok") {
        setPhase({
          kind: "retry",
          message:
            order.status === "error"
              ? order.message
              : "Could not start payment.",
        });
        return;
      }
      const { orderId, amount, currency, keyId } = order.data as {
        orderId: string;
        amount: number;
        currency: string;
        keyId: string;
      };
      if (!keyId) throw new Error("Payments are misconfigured (no key id).");

      await loadCheckout();
      setPhase({
        kind: "busy",
        message: "Complete the payment in the Razorpay window…",
      });

      const rzp = new window.Razorpay!({
        key: keyId,
        order_id: orderId,
        amount,
        currency,
        name: "ArtWall",
        description: "Physical wall booking",
        prefill,
        handler: async (response: RazorpayResponse) => {
          setPhase({ kind: "busy", message: "Confirming your payment…" });
          const result = await verifyPayment(response).catch(() => null);
          if (!result || result.status !== "ok") {
            setPhase({
              kind: "retry",
              message:
                result?.status === "error"
                  ? result.message
                  : "We couldn't confirm the payment yet. If money left your account it will be confirmed or refunded automatically.",
            });
            return;
          }
          const status = (result.data as { status?: string } | undefined)
            ?.status;
          if (status === "paid") {
            setPhase({ kind: "paid", message: result.message });
          } else {
            // Authorised but not captured yet: the webhook will settle it.
            setPhase({ kind: "busy", message: result.message });
          }
          router.refresh();
        },
        modal: {
          ondismiss: () =>
            setPhase((p) =>
              p.kind === "busy" && p.message.startsWith("Complete")
                ? {
                    kind: "retry",
                    message:
                      "Payment cancelled. Your slots are still held — you can try again.",
                  }
                : p
            ),
        },
      });
      rzp.on("payment.failed", (r) =>
        setPhase({
          kind: "retry",
          message: `Payment failed${r.error?.description ? `: ${r.error.description}` : ""}. Your slots are still held — you can try again.`,
        })
      );
      rzp.open();
    } catch (error) {
      setPhase({
        kind: "retry",
        message:
          error instanceof Error ? error.message : "Could not start payment.",
      });
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {phase.kind !== "paid" && (
        <button
          type="button"
          onClick={pay}
          disabled={phase.kind === "busy"}
          className="text-small bg-ember text-wall-paper hover:bg-ember-glow inline-flex h-10 items-center justify-center gap-2 rounded-md border border-transparent px-4 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase.kind === "retry" ? `Try again · ${label}` : label}
        </button>
      )}
      {phase.kind !== "idle" && (
        <p
          role={phase.kind === "retry" ? "alert" : "status"}
          data-testid="pay-status"
          className={`text-sm ${phase.kind === "retry" ? "text-destructive" : phase.kind === "paid" ? "text-signal" : "text-ink-muted"}`}
        >
          {phase.message}
        </p>
      )}
    </div>
  );
}
