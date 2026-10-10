import type { Metadata } from "next";
import Link from "next/link";

import { requireBuyerPage } from "@/features/orders/authorize";
import { getBuyerOrders } from "@/features/orders/data";
import { formatINR } from "@/features/physical-wall/money";

export const metadata: Metadata = { title: "Your orders", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { pending_payment: "Awaiting payment", paid: "Paid", expired: "Expired", cancelled: "Cancelled" };

export default async function OrdersPage() {
  const buyer = await requireBuyerPage("/orders");
  const orders = await getBuyerOrders(buyer.id);
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-heading text-display">Your orders</h1>
      {orders.length === 0 ? (
        <p className="text-ink-muted mt-6">No orders yet.</p>
      ) : (
        <ul className="border-hairline mt-8 divide-y border-y">
          {orders.map((o) => (
            <li key={o.id} className="py-4">
              <Link href={`/orders/${o.orderNumber}`} className="flex items-baseline justify-between gap-4 hover:underline">
                <span>
                  <span className="font-medium">{o.orderNumber}</span>
                  <span className="text-ink-muted block text-sm">{o.titles.join(", ")}</span>
                </span>
                <span className="text-right text-sm">
                  {formatINR(o.totalPaise)}
                  <span className="text-ink-muted block">{LABEL[o.status] ?? o.status}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
