"use client";

import { Bookmark, Heart, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { likeArtwork, saveArtwork, unlikeArtwork, unsaveArtwork } from "./actions";
import type { ArtworkSocial } from "./actions";

/**
 * Like / comment-count / save, under the artwork.
 *
 * Optimistic: a like must feel instant, and the server call is a confirmation,
 * not a gate. If the call fails the state is rolled back by re-reading from the
 * server (`router.refresh()`), so the UI can never sit in a lie.
 *
 * A signed-out visitor sees the counts and is sent to sign-in on tap, rather
 * than having the controls hidden — the counts are social proof and the
 * disabled state would teach them nothing.
 */
export function SocialBar({
  artworkId,
  initial,
  signedIn,
  onCommentClick,
}: {
  artworkId: string;
  initial: ArtworkSocial;
  signedIn: boolean;
  onCommentClick?: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [state, applyOptimistic] = useOptimistic(
    initial,
    (current: ArtworkSocial, patch: Partial<ArtworkSocial>) => ({ ...current, ...patch })
  );

  function requireSignIn(): boolean {
    if (signedIn) return false;
    router.push(`/sign-in?returnTo=/artwork/${artworkId}`);
    return true;
  }

  function toggleLike() {
    if (requireSignIn()) return;
    const nextLiked = !state.viewerLiked;

    startTransition(async () => {
      applyOptimistic({
        viewerLiked: nextLiked,
        likeCount: state.likeCount + (nextLiked ? 1 : -1),
      });
      const result = nextLiked ? await likeArtwork(artworkId) : await unlikeArtwork(artworkId);
      if (!result.ok) setError(result.error);
      // Either way, re-read: on success this settles the real count, on
      // failure it discards the optimistic value.
      router.refresh();
    });
  }

  function toggleSave() {
    if (requireSignIn()) return;
    const nextSaved = !state.viewerSaved;

    startTransition(async () => {
      applyOptimistic({ viewerSaved: nextSaved });
      const result = nextSaved ? await saveArtwork(artworkId) : await unsaveArtwork(artworkId);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={state.viewerLiked}
          aria-label={state.viewerLiked ? "Unlike this artwork" : "Like this artwork"}
          className="text-ink-muted hover:text-ink flex items-center gap-2 text-sm transition-colors"
        >
          <Heart
            aria-hidden
            className={`size-5 ${state.viewerLiked ? "fill-current text-[#e0703a]" : ""}`}
          />
          <span className="tabular-nums">{state.likeCount}</span>
        </button>

        <button
          type="button"
          onClick={onCommentClick}
          className="text-ink-muted hover:text-ink flex items-center gap-2 text-sm transition-colors"
          aria-label="Comments"
        >
          <MessageCircle aria-hidden className="size-5" />
          <span className="tabular-nums">{state.commentCount}</span>
        </button>

        <button
          type="button"
          onClick={toggleSave}
          aria-pressed={state.viewerSaved}
          aria-label={state.viewerSaved ? "Remove from saved" : "Save this artwork"}
          className="text-ink-muted hover:text-ink ml-auto flex items-center gap-2 text-sm transition-colors"
        >
          <Bookmark aria-hidden className={`size-5 ${state.viewerSaved ? "fill-current" : ""}`} />
          <span className="sr-only">{state.viewerSaved ? "Saved" : "Save"}</span>
        </button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
