import { notFound } from "next/navigation";

import { StudioPageHeader } from "@/components/dashboard/studio-shell";
import { features } from "@/config/site";
import { SellerOrderActions } from "@/features/orders/components/order-actions";
import { getSellerOrders } from "@/features/orders/data";
import { formatINR } from "@/features/physical-wall/money";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  paid: "Needs your acceptance",
  processing: "Accepted: ship it",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Paid out to you (see Finance)",
  refund_pending: "Refunding the buyer",
  refunded: "Refunded",
};

export default async function StudioOrdersPage() {
  if (!features.marketplaceCheckout) notFound();
  const user = await getSessionUser();
  if (!user) notFound();
  const orders = await getSellerOrders(user.id);

  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Business"
        title="Orders"
        description="Orders for your works. Accept within the window, ship with a tracking number, and you are paid once the buyer confirms delivery (or the dispute window ends). Each order is yours alone, even if the buyer also bought from other artists."
      />
      {orders.length === 0 ? (
        <p className="text-ink-muted text-sm">No orders yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((o) => (
            <li key={o.id} className="studio-card" data-testid="studio-order">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  {o.orderNumber} · {o.items.map((i) => i.title).join(", ")}
                </p>
                <p className="text-sm font-medium">{STATUS[o.status] ?? o.status}</p>
              </div>
              <p className="text-ink-muted mt-1 text-sm">
                You receive {formatINR(o.youReceivePaise)} (after commission, incl. shipping {formatINR(o.shippingPaise)}). Placed {o.placedAt.toLocaleDateString("en-IN")}.
                {o.status === "paid" && o.acceptBy && ` Accept by ${o.acceptBy.toLocaleString("en-IN")}.`}
              </p>
              {["processing", "shipped", "delivered", "completed"].includes(o.status) && o.address && (
                <p className="mt-2 text-sm">
                  Ship to {o.address.name} ({o.address.phone}), {o.address.line1}
                  {o.address.line2 ? `, ${o.address.line2}` : ""}, {o.address.city}, {o.address.state} {o.address.pincode}
                </p>
              )}
              {o.awb && (
                <p className="text-ink-muted mt-1 text-sm">
                  {o.courier} · {o.awb}
                </p>
              )}
              <SellerOrderActions sellerOrderId={o.id} status={o.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
