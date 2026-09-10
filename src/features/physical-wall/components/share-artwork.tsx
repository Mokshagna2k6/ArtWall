"use client";

import { useActionState, useState } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import { shareArtwork } from "@/features/physical-wall/actions/engagement";
import { FormStatus } from "@/features/physical-wall/components/form-bits";

/**
 * Social sharing (F23).
 *
 * Platform-specific share buttons plus a copy-link fallback. The share text
 * includes the artwork title, artist name, and a link to the public page.
 * OG tags on that page make the share look right on every platform.
 */

const TARGETS = [
  { id: "whatsapp", label: "WhatsApp", color: "#25D366" },
  { id: "instagram", label: "Instagram", color: "#E4405F" },
  { id: "x", label: "X", color: "#0A0A0F" },
  { id: "copy", label: "Copy link", color: "#2563EB" },
] as const;

export function ShareArtwork({
  artworkId,
  title,
  artistName,
}: {
  artworkId: string;
  title: string;
  artistName: string;
}) {
  const [state, formAction] = useActionState(shareArtwork, IDLE);
  const [copied, setCopied] = useState(false);

  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/physical-wall/a/${artworkId}`;
  const text = `${title} by ${artistName} — live now at The Wall, Ric Platter Jaipur. ${url}`;

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-heading text-card">Share this work</h3>
      <p className="text-ink-muted text-sm leading-6">
        Share to your story or send the link. The public page opens with the
        artwork image and the artist&rsquo;s story — no account needed.
      </p>

      <div className="flex flex-wrap gap-2">
        {TARGETS.map((target) => {
          if (target.id === "copy") {
            return (
              <button
                key={target.id}
                type="button"
                onClick={copyLink}
                className="border-hairline-strong hover:border-ink text-small inline-flex h-10 items-center gap-2 rounded-md border px-4"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: target.color }}
                  aria-hidden
                />
                {copied ? "Copied" : "Copy link"}
              </button>
            );
          }

          return (
            <a
              key={target.id}
              href={encodeURI(
                target.id === "x"
                  ? `https://x.com/intent/post?text=${encodeURIComponent(text)}`
                  : target.id === "whatsapp"
                    ? `https://wa.me/?text=${encodeURIComponent(text)}`
                    : `https://www.instagram.com/`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="border-hairline-strong hover:border-ink text-small inline-flex h-10 items-center gap-2 rounded-md border px-4"
            >
              <span
                className="size-2.5 rounded-full"
                style={{ background: target.color }}
                aria-hidden
              />
              {target.label}
            </a>
          );
        })}
      </div>

      <FormStatus state={state} />
    </div>
  );
}
