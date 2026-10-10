"use client";

import { useState, useTransition } from "react";
import { Flame, Gem, Heart, Share2, Sparkles, Zap } from "lucide-react";

import { react } from "@/features/physical-wall/actions/engagement";
import { REACTION_KINDS, type ReactionKind } from "@/features/physical-wall/schema";

/**
 * Reactions and sharing on an artwork page (F23, F24).
 *
 * Reactions are optimistic: the count moves the instant it is tapped, then
 * settles on whatever the server says. Someone standing in a restaurant on
 * patchy wifi should not watch a number think about it, and the true value
 * arrives a moment later either way.
 *
 * No account is needed and none is created. The counts are aggregates, so
 * there is nothing recording that *you* liked this — which is why the
 * optimistic value can never be "corrected" into revealing anything.
 */

const ICONS: Record<ReactionKind, typeof Flame> = {
  fire: Flame,
  love: Heart,
  art: Sparkles,
  gem: Gem,
  wow: Zap,
};

const LABELS: Record<ReactionKind, string> = {
  fire: "Striking",
  love: "Love it",
  art: "Beautifully made",
  gem: "A find",
  wow: "Stopped me",
};

export function ArtworkActions({
  artworkId,
  title,
  artistName,
  shareUrl,
  initialCounts,
}: {
  artworkId: string;
  title: string;
  artistName: string;
  shareUrl: string;
  initialCounts: Record<string, number>;
}) {
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts);
  const [tapped, setTapped] = useState<Set<string>>(new Set());
  const [, startTap] = useTransition();
  const [shareNote, setShareNote] = useState<string | null>(null);

  function tap(kind: ReactionKind) {
    setCounts((current) => ({ ...current, [kind]: (current[kind] ?? 0) + 1 }));
    setTapped((current) => new Set(current).add(kind));

    startTap(async () => {
      const result = await react(artworkId, kind);
      if (result.ok) {
        setCounts((current) => ({ ...current, [kind]: result.count }));
      } else {
        // Throttled or failed — put the optimistic increment back.
        setCounts((current) => ({
          ...current,
          [kind]: Math.max(0, (current[kind] ?? 1) - 1),
        }));
      }
    });
  }

  const shareText = `${title} by ${artistName} — on The Wall at Ric Platter.`;

  async function share() {
    // The Web Share API is the right thing on a phone, which is where every
    // one of these pages is opened. Desktop falls back to the clipboard.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text: shareText, url: shareUrl });
        return;
      } catch {
        // The visitor dismissed the sheet. Not an error, and not worth a message.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      setShareNote("Link copied.");
      setTimeout(() => setShareNote(null), 3000);
    } catch {
      setShareNote(shareUrl);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-label text-ink-muted tracking-wider uppercase">
          How does it strike you?
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {REACTION_KINDS.map((kind) => {
            const Icon = ICONS[kind];
            const count = counts[kind] ?? 0;
            const done = tapped.has(kind);
            return (
              <li key={kind}>
                <button
                  type="button"
                  onClick={() => tap(kind)}
                  aria-label={`${LABELS[kind]} — ${count} so far`}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors ${
                    done
                      ? "border-ink bg-band"
                      : "border-hairline-strong hover:border-ink"
                  }`}
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="tabular-nums">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={share}
          className="border-hairline-strong hover:border-ink text-small inline-flex h-10 items-center gap-2 rounded-md border px-4"
        >
          <Share2 className="size-4" aria-hidden />
          Share this work
        </button>
        <span aria-live="polite" className="text-ink-muted text-xs">
          {shareNote}
        </span>
      </div>
    </div>
  );
}
