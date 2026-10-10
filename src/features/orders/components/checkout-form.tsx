"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { cancelCheckout, getCheckoutStatus, placeCheckout, verifyCheckoutPayment } from "@/features/orders/actions/checkout";

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayCtor = new (options: Record<string, unknown>) => {
  open(): void;
  on(event: "payment.failed", cb: (r: { error?: { description?: string } }) => void): void;
};
const razorpay = () => (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;

function loadCheckout(): Promise<void> {
  if (razorpay()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Razorpay Checkout."));
    document.body.appendChild(s);
  });
}

type Phase = { kind: "idle" } | { kind: "busy"; message: string } | { kind: "retry"; message: string } | { kind: "confirming"; message: string };

const FIELD = "studio-input w-full";

/**
 * Address + pay. The server creates the order and prices it from the database;
 * this form sends only the address and a per-page idempotency key. The order
 * only reads "paid" after the server says so (verify, or the webhook).
 */
export function CheckoutForm({ prefillName, prefillEmail }: { prefillName: string; prefillEmail: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const idempotencyKey = useRef(crypto.randomUUID());
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function waitForPaid(orderId: string, orderNumber: string) {
    setPhase({ kind: "confirming", message: "Payment received. Confirming your order. Don't pay again; this updates by itself." });
    for (let i = 0; i < 40; i++) {
      const s = await getCheckoutStatus({ orderId }).catch(() => null);
      if (s?.ok && s.data.status === "paid") return router.push(`/orders/${orderNumber}`);
      if (s?.ok && s.data.status !== "pending_payment") break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    setPhase({ kind: "confirming", message: "Your payment is still being confirmed. You don't need to pay again. Check your orders page in a few minutes; if it isn't confirmed it is refunded automatically." });
  }

  async function pay(form: HTMLFormElement) {
    if (inFlight.current) return;
    inFlight.current = true;
    const f = new FormData(form);
    const address = Object.fromEntries(["name", "phone", "line1", "line2", "city", "state", "pincode"].map((k) => [k, String(f.get(k) ?? "")]));
    setPhase({ kind: "busy", message: "Creating your order…" });
    try {
      const started = await placeCheckout({ address, idempotencyKey: idempotencyKey.current });
      if (!started.ok) {
        setPhase({ kind: "retry", message: started.error });
        idempotencyKey.current = crypto.randomUUID(); // a failed attempt must not pin the next one to it
        inFlight.current = false;
        return;
      }
      const o = started.data;
      setOpenOrderId(o.orderId);
      if (o.status === "paid") return router.push(`/orders/${o.orderNumber}`);
      if (!o.keyId || !o.providerOrderId) throw new Error("Payments are misconfigured.");

      await loadCheckout();
      setPhase({ kind: "busy", message: "Complete the payment in the Razorpay window…" });
      let handled = false;
      const Rz = razorpay()!;
      const rzp = new Rz({
        key: o.keyId,
        order_id: o.providerOrderId,
        amount: o.amountPaise,
        currency: o.currency,
        name: "ArtWall",
        description: `Order ${o.orderNumber}`,
        prefill: { name: prefillName, email: prefillEmail, contact: address.phone },
        handler: async (response: RazorpayResponse) => {
          handled = true;
          setPhase({ kind: "busy", message: "Confirming your payment…" });
          const v = await verifyCheckoutPayment(response).catch(() => null);
          if (v?.ok && v.data.status === "paid") return router.push(`/orders/${o.orderNumber}`);
          await waitForPaid(o.orderId, o.orderNumber);
        },
        modal: {
          ondismiss: () => {
            if (handled) return;
            inFlight.current = false;
            setPhase({ kind: "retry", message: "Payment cancelled. Your works are held for a short while; you can try again." });
          },
        },
      });
      rzp.on("payment.failed", (r) =>
        setPhase({ kind: "busy", message: `Payment failed${r.error?.description ? `: ${r.error.description}` : ""}. Try another method in the Razorpay window, or close it.` })
      );
      rzp.open();
    } catch (error) {
      inFlight.current = false;
      idempotencyKey.current = crypto.randomUUID();
      setPhase({ kind: "retry", message: error instanceof Error ? error.message : "Could not start payment." });
    }
  }

  const locked = phase.kind === "busy" || phase.kind === "confirming";

  return (
    <form
      className="mt-6 grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void pay(e.currentTarget);
      }}
    >
      <h2 className="font-heading text-card sm:col-span-2">Shipping address (India)</h2>
      <label className="text-sm">
        Full name
        <input name="name" required defaultValue={prefillName} className={FIELD} autoComplete="name" />
      </label>
      <label className="text-sm">
        Mobile number
        <input name="phone" required inputMode="tel" className={FIELD} autoComplete="tel" placeholder="98765 43210" />
      </label>
      <label className="text-sm sm:col-span-2">
        Address line 1
        <input name="line1" required className={FIELD} autoComplete="address-line1" />
      </label>
      <label className="text-sm sm:col-span-2">
        Address line 2 (optional)
        <input name="line2" className={FIELD} autoComplete="address-line2" />
      </label>
      <label className="text-sm">
        City
        <input name="city" required className={FIELD} autoComplete="address-level2" />
      </label>
      <label className="text-sm">
        State
        <input name="state" required className={FIELD} autoComplete="address-level1" />
      </label>
      <label className="text-sm">
        PIN code
        <input name="pincode" required inputMode="numeric" maxLength={6} className={FIELD} autoComplete="postal-code" />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={locked} aria-busy={locked} className="studio-button" data-testid="pay-button">
          {phase.kind === "retry" ? "Try again · Pay now" : "Pay now"}
        </button>
        {phase.kind === "retry" && openOrderId && (
          <button
            type="button"
            className="text-ink-muted ml-4 text-sm underline"
            onClick={async () => {
              await cancelCheckout({ orderId: openOrderId });
              router.push("/cart");
            }}
          >
            Cancel this checkout
          </button>
        )}
        <p
          role={phase.kind === "retry" ? "alert" : "status"}
          aria-live={phase.kind === "retry" ? "assertive" : "polite"}
          className={`mt-3 text-sm ${phase.kind === "idle" ? "sr-only" : ""} ${phase.kind === "retry" ? "text-destructive" : "text-ink-muted"}`}
        >
          {phase.kind === "idle" ? "" : phase.message}
        </p>
      </div>
    </form>
  );
}
