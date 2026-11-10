"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { followUser, unfollowUser } from "./actions";

/**
 * Follow / following, with the follower count beside it.
 *
 * Optimistic for the same reason as the like button: the round trip is a
 * confirmation, not a gate. A signed-out visitor is sent to sign-in rather
 * than shown a dead control.
 */
export function FollowButton({
  profileUserId,
  returnTo,
  initialFollowing,
  initialFollowers,
  signedIn,
  isSelf,
}: {
  profileUserId: string;
  returnTo: string;
  initialFollowing: boolean;
  initialFollowers: number;
  signedIn: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [state, applyOptimistic] = useOptimistic(
    { following: initialFollowing, followers: initialFollowers },
    (current, patch: { following: boolean; followers: number }) => ({ ...current, ...patch })
  );

  // Your own profile gets the count, not a button you cannot press.
  if (isSelf) {
    return (
      <p className="text-ink-muted text-sm">
        <span className="tabular-nums">{state.followers}</span>{" "}
        {state.followers === 1 ? "follower" : "followers"}
      </p>
    );
  }

  function toggle() {
    if (!signedIn) {
      router.push(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    const next = !state.following;

    startTransition(async () => {
      applyOptimistic({
        following: next,
        followers: state.followers + (next ? 1 : -1),
      });
      const result = next ? await followUser(profileUserId) : await unfollowUser(profileUserId);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={state.following}
          className={
            state.following
              ? "border-border hover:border-ink rounded-full border px-5 py-1.5 text-sm"
              : "bg-ink text-paper rounded-full px-5 py-1.5 text-sm"
          }
        >
          {state.following ? "Following" : "Follow"}
        </button>
        <span className="text-ink-muted text-sm">
          <span className="tabular-nums">{state.followers}</span>{" "}
          {state.followers === 1 ? "follower" : "followers"}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
