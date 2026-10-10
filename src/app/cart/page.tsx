import type { Metadata } from "next";
import Link from "next/link";

import { CloudinaryImage as Image } from "@/components/media/cloudinary-image";
import { requireBuyerPage } from "@/features/orders/authorize";
import { loadCart } from "@/features/orders/cart";
import { RemoveFromCartButton, RemoveUnavailableButton } from "@/features/orders/components/cart-buttons";
import { formatINR } from "@/features/physical-wall/money";

export const metadata: Metadata = { title: "Your cart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const buyer = await requireBuyerPage("/cart");
  const cart = await loadCart(buyer.id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-heading text-display">Your cart</h1>
      {cart.lines.length === 0 ? (
        <p className="text-ink-muted mt-6">
          Your cart is empty. <Link href="/discover" className="underline">Discover artworks</Link>.
        </p>
      ) : (
        <>
          <ul className="border-hairline mt-8 divide-y border-y">
            {cart.lines.map((l) => (
              <li key={l.artworkId} className="flex items-center gap-4 py-4" data-testid="cart-line">
                <div className="bg-band relative aspect-square w-20 shrink-0 overflow-hidden rounded">
                  {l.imageUrl && <Image src={l.imageUrl} alt="" fill className="object-cover" sizes="80px" />}
                </div>
                <div className="flex-1">
                  <Link href={`/artwork/${l.artworkId}`} className="font-heading text-card hover:underline">
                    {l.title}
                  </Link>
                  {l.sellerName && <p className="text-ink-muted text-sm">{l.sellerName}</p>}
                  {l.issueMessage && (
                    <p role="alert" className="text-destructive mt-1 text-sm">
                      Can&rsquo;t be bought right now: {l.issueMessage}
                    </p>
                  )}
                  {l.curatorUserId && !l.issue && <p className="text-ink-muted mt-1 text-xs">Curated pick</p>}
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${l.issue ? "line-through opacity-50" : ""}`}>{l.pricePaise ? formatINR(l.pricePaise) : "—"}</p>
                  <RemoveFromCartButton artworkId={l.artworkId} />
                </div>
              </li>
            ))}
          </ul>

          {cart.groups.length > 0 && (
            <section className="mt-8" aria-label="Order summary">
              <h2 className="font-heading text-card">Summary</h2>
              {cart.groups.map((g) => (
                <div key={g.sellerId} className="border-hairline mt-3 rounded-md border p-4 text-sm">
                  <div className="flex justify-between">
                    <span>
                      {g.lines.length} {g.lines.length === 1 ? "work" : "works"} from one artist
                    </span>
                    <span>{formatINR(g.subtotalPaise)}</span>
                  </div>
                  <div className="text-ink-muted flex justify-between">
                    <span>Shipping</span>
                    <span>{formatINR(g.shippingPaise)}</span>
                  </div>
                  <p className="text-ink-muted mt-2 text-xs">
                    Of the work&rsquo;s price: artist {formatINR(g.sellerNetPaise)}, ArtWall commission {formatINR(g.platformFeePaise)}
                    {g.curatorFeePaise > 0 ? `, curator ${formatINR(g.curatorFeePaise)}` : ""}. Held in escrow until you receive it.
                  </p>
                </div>
              ))}
              <p className="mt-4 flex justify-between text-base font-medium">
                <span>Total</span>
                <span data-testid="cart-total">{formatINR(cart.totals.totalPaise)}</span>
              </p>
            </section>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            {cart.hasIssues && <RemoveUnavailableButton />}
            {cart.overLimit ? (
              <p role="alert" className="text-destructive text-sm">
                This is above the {formatINR(cart.maxOrderPaise)} we can take online. Please contact us.
              </p>
            ) : cart.hasIssues ? (
              <p className="text-ink-muted text-sm">Remove the unavailable items to continue to checkout.</p>
            ) : (
              <Link href="/checkout" className="studio-button" data-testid="go-checkout">
                Checkout
              </Link>
            )}
          </div>
        </>
      )}
    </main>
  );
}
