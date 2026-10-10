import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireBuyerPage } from "@/features/orders/authorize";
import { loadCart } from "@/features/orders/cart";
import { CheckoutForm } from "@/features/orders/components/checkout-form";
import { formatINR } from "@/features/physical-wall/money";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const buyer = await requireBuyerPage("/checkout");
  const cart = await loadCart(buyer.id);
  if (cart.lines.length === 0 || cart.hasIssues || cart.overLimit) redirect("/cart");

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-heading text-display">Checkout</h1>
      <section className="border-hairline mt-6 rounded-md border p-4 text-sm" aria-label="Order summary">
        {cart.lines.map((l) => (
          <p key={l.artworkId} className="flex justify-between py-0.5">
            <span>{l.title}</span>
            <span>{l.pricePaise ? formatINR(l.pricePaise) : ""}</span>
          </p>
        ))}
        <p className="text-ink-muted mt-2 flex justify-between">
          <span>
            Shipping ({cart.groups.length} {cart.groups.length === 1 ? "artist" : "artists"})
          </span>
          <span>{formatINR(cart.totals.shippingPaise)}</span>
        </p>
        <p className="mt-2 flex justify-between text-base font-medium">
          <span>Total</span>
          <span>{formatINR(cart.totals.totalPaise)}</span>
        </p>
        {cart.groups.length > 1 && (
          <p className="text-ink-muted mt-3 text-xs">
            You&rsquo;re buying from {cart.groups.length} artists with one payment. Each artist accepts, ships and is paid separately, so a problem with one never affects the others.
          </p>
        )}
        <p className="text-ink-muted mt-2 text-xs">
          Your payment is held in escrow and released to each artist only after you confirm delivery (or after the dispute window).{" "}
          <Link href="/cart" className="underline">
            Edit cart
          </Link>
        </p>
      </section>
      <CheckoutForm prefillName={buyer.name} prefillEmail={buyer.email} />
    </main>
  );
}
