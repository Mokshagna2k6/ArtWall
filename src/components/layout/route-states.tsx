"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Shared error.tsx / loading.tsx bodies (FE-2.16). A thrown query in a
 * segment lands here instead of the Next.js crash page. Server errors reach
 * the client as a generic message plus `digest`; we show only the digest.
 */
export function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section
      role="alert"
      className="mx-auto flex max-w-2xl flex-col items-center gap-5 px-5 py-24 text-center"
    >
      <h1 className="font-heading text-h1 tracking-tight text-balance">
        Something went wrong loading this page.
      </h1>
      <p className="text-muted-foreground text-balance">
        It&rsquo;s on our side, not yours. Try again, and if it keeps
        happening, let us know
        {error.digest ? ` and quote reference ${error.digest}` : ""}.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="bg-ember hover:bg-ember-glow inline-flex h-11 items-center rounded-md px-5 font-medium text-white transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="border-hairline-strong hover:border-ink inline-flex h-11 items-center rounded-md border px-5"
        >
          Home
        </Link>
      </div>
    </section>
  );
}

export function RouteLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="text-muted-foreground mx-auto flex max-w-2xl items-center justify-center gap-3 px-5 py-24"
    >
      <span
        className="border-hairline-strong border-t-ember size-5 animate-spin rounded-full border-2"
        aria-hidden
      />
      Loading…
    </div>
  );
}
