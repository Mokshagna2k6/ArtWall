"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addCollectionToCart, addToCart, removeFromCart, removeUnavailableFromCart } from "@/features/orders/actions/cart";

/** Shared: run a cart action, show its message, refresh the page. */
function useCartAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const run = (fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, then?: () => void, okText?: (d: unknown) => string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setMessage({ text: r.error, error: true });
        return;
      }
      setMessage(okText ? { text: okText(r.data), error: false } : null);
      if (then) then();
      else router.refresh();
    });
  return { pending, message, run };
}

function Message({ message }: { message: { text: string; error: boolean } | null }) {
  if (!message) return null;
  return (
    <p role={message.error ? "alert" : "status"} className={`mt-2 text-sm ${message.error ? "text-destructive" : "text-ink-muted"}`}>
      {message.text}
      {message.error && message.text.startsWith("Sign in") && (
        <>
          {" "}
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>
        </>
      )}
    </p>
  );
}

/** "Add to cart" and "Buy now" (buy-now is just a one-item cart, straight to checkout). */
export function AddToCartButtons({ artworkId }: { artworkId: string }) {
  const router = useRouter();
  const { pending, message, run } = useCartAction();
  return (
    <div className="mt-4" data-testid="add-to-cart">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          className="studio-button"
          onClick={() => run(() => addToCart({ artworkId }), () => router.push("/checkout"))}
        >
          Buy now
        </button>
        <button
          type="button"
          disabled={pending}
          className="studio-button"
          onClick={() => run(() => addToCart({ artworkId }), undefined, () => "Added to your cart.")}
        >
          Add to cart
        </button>
        <Link href="/cart" className="text-ink-muted self-center text-sm underline">
          View cart
        </Link>
      </div>
      <Message message={message} />
    </div>
  );
}

export function AddCollectionToCartButton({ collectionId }: { collectionId: string }) {
  const { pending, message, run } = useCartAction();
  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={pending}
        className="studio-button"
        onClick={() =>
          run(
            () => addCollectionToCart({ collectionId }),
            undefined,
            (d) => {
              const r = d as { added: number; alreadyInCart: number; skipped: unknown[] };
              return `Added ${r.added} to your cart${r.alreadyInCart ? `, ${r.alreadyInCart} already there` : ""}${r.skipped.length ? `, ${r.skipped.length} not available` : ""}.`;
            }
          )
        }
      >
        Add all available works to cart
      </button>
      <Link href="/cart" className="text-ink-muted ml-3 text-sm underline">
        View cart
      </Link>
      <Message message={message} />
    </div>
  );
}

export function RemoveFromCartButton({ artworkId }: { artworkId: string }) {
  const { pending, message, run } = useCartAction();
  return (
    <>
      <button type="button" disabled={pending} className="text-ink-muted text-sm underline" onClick={() => run(() => removeFromCart({ artworkId }))}>
        Remove
      </button>
      <Message message={message} />
    </>
  );
}

export function RemoveUnavailableButton() {
  const { pending, message, run } = useCartAction();
  return (
    <div>
      <button type="button" disabled={pending} className="studio-button" onClick={() => run(() => removeUnavailableFromCart({}))}>
        Remove unavailable items
      </button>
      <Message message={message} />
    </div>
  );
}
