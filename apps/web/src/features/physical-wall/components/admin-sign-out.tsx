"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * Sign out of the admin shell.
 *
 * The admin area hides SiteHeader and SiteFooter entirely
 * (src/app/layout.tsx), so the account dropdown that carries sign-out on every
 * public page does not render here — leaving an admin with no way out except
 * clearing cookies. This is the admin shell's own copy.
 *
 * Redirects to "/" rather than back to the admin area: signing in again lands
 * there anyway, and a signed-out visitor bounced to a page that immediately
 * redirects them to /sign-in reads like the sign-out failed.
 *
 * `router.refresh()` after the push discards the cached Server Component
 * render, which still holds the signed-in shell.
 */
export function AdminSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = useCallback(async () => {
    setPending(true);
    try {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }, [router]);

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="border-hairline text-ink-muted hover:text-ink hover:border-hairline-strong mb-6 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-60"
    >
      <LogOut className="size-3.5 shrink-0" aria-hidden />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
