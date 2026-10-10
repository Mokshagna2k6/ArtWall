import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireBuyerPage } from "@/features/orders/authorize";
import { getBuyerOrder } from "@/features/orders/data";
import { BuyerOrderActions } from "@/features/orders/components/order-actions";
import { formatINR } from "@/features/physical-wall/money";

export const metadata: Metadata = { title: "Order", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  pending_payment: "Awaiting payment",
  expired: "Expired (not paid in time)",
  cancelled: "Cancelled",
  paid: "Waiting for the artist to accept",
  processing: "Artist is preparing it",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Complete",
  refund_pending: "Refund on its way",
  refunded: "Refunded",
};

export default async function OrderPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const buyer = await requireBuyerPage(`/orders/${orderNumber}`);
  const order = await getBuyerOrder(buyer.id, orderNumber);
  if (!order) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-ink-muted text-sm">
        <Link href="/orders" className="underline">
          All orders
        </Link>
      </p>
      <h1 className="font-heading text-display mt-2">Order {order.orderNumber}</h1>
      <p className="text-ink-muted mt-1 text-sm">
        Placed {order.createdAt.toLocaleDateString("en-IN")} · Total {formatINR(order.totalPaise)} ·{" "}
        {order.status === "paid" ? "Paid" : (STATUS[order.status] ?? order.status)}
      </p>

      {order.sellerOrders.map((so) => (
        <section key={so.id} className="border-hairline mt-8 rounded-md border p-4" aria-label={`From ${so.sellerName}`} data-testid="seller-order">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-heading text-card">From {so.sellerName}</h2>
            <span className="text-sm font-medium" data-testid="seller-order-status">
              {STATUS[so.status] ?? so.status}
            </span>
          </div>
          <ul className="mt-3 text-sm">
            {so.items.map((i) => (
              <li key={i.id} className="flex justify-between py-0.5">
                {i.artworkId ? (
                  <Link href={`/artwork/${i.artworkId}`} className="hover:underline">
                    {i.title}
                  </Link>
                ) : (
                  <span>{i.title}</span>
                )}
                <span>{formatINR(i.pricePaise)}</span>
              </li>
            ))}
            <li className="text-ink-muted flex justify-between py-0.5">
              <span>Shipping</span>
              <span>{formatINR(so.shippingPaise)}</span>
            </li>
          </ul>
          {so.refundedPaise > 0 && <p className="mt-2 text-sm">Refunded: {formatINR(so.refundedPaise)}</p>}
          {so.awb && (
            <p className="mt-2 text-sm">
              Shipped via {so.courier} · tracking {so.awb}
              {so.trackingUrl && (
                <>
                  {" "}
                  <a href={so.trackingUrl} className="underline" rel="noopener noreferrer" target="_blank">
                    Track
                  </a>
                </>
              )}
            </p>
          )}
          {so.status === "paid" && so.acceptBy && (
            <p className="text-ink-muted mt-2 text-xs">
              The artist has until {so.acceptBy.toLocaleString("en-IN")} to accept; otherwise you&rsquo;re refunded automatically.
            </p>
          )}
          {so.status === "delivered" && !so.buyerConfirmedAt && so.releaseEligibleAt && (
            <p className="text-ink-muted mt-2 text-xs">
              Payment is released to the artist on {so.releaseEligibleAt.toLocaleDateString("en-IN")} unless you tell us about a problem first.
            </p>
          )}
          <BuyerOrderActions sellerOrderId={so.id} status={so.status} confirmed={Boolean(so.buyerConfirmedAt)} />
        </section>
      ))}

      <section className="mt-8">
        <h2 className="font-heading text-card">Delivering to</h2>
        <p className="text-ink-muted mt-2 text-sm">
          {order.address.name}, {order.address.line1}
          {order.address.line2 ? `, ${order.address.line2}` : ""}, {order.address.city}, {order.address.state} {order.address.pincode}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-heading text-card">Timeline</h2>
        <ol className="mt-3 space-y-1 text-sm">
          {order.events.map((e, i) => (
            <li key={i} className="text-ink-muted">
              {e.at.toLocaleString("en-IN")} · {STATUS[e.toStatus] ?? e.toStatus}
              {e.note ? ` (${e.note})` : ""}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
