"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

/**
 * Share this artwork page. Native share sheet where the browser has one,
 * copy-to-clipboard everywhere else. No tracking and no server call — the URL
 * is already public, and the page's OG tags make the preview look right.
 */
export function ShareArtworkButton({ title, artistName }: { title: string; artistName: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    const text = `${title} by ${artistName} on ArtWall`;
    if (navigator.share) {
      // A cancelled share sheet rejects; that is a user action, not an error.
      await navigator.share({ title: text, url }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="text-ink-muted hover:text-ink flex items-center gap-2 text-sm"
    >
      {copied ? <Check aria-hidden className="size-4" /> : <Share2 aria-hidden className="size-4" />}
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
