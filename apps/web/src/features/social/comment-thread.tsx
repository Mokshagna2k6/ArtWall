"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";

import { deleteComment, postComment, type CommentView } from "./actions";

/**
 * A two-level comment thread.
 *
 * Comments arrive flat with `parentId` and are nested here — a thread this
 * shallow does not justify a recursive SQL query. A soft-deleted comment keeps
 * its slot ("Comment removed") because its replies are still other people's
 * words and would otherwise lose their context.
 */
export function CommentThread({
  artworkId,
  comments,
  viewerId,
  signedIn,
  canModerate = false,
}: {
  artworkId: string;
  comments: CommentView[];
  viewerId: string | null;
  signedIn: boolean;
  /** The artist whose work this is may remove comments on their own page. */
  canModerate?: boolean;
}) {
  const roots = comments.filter((c) => !c.parentId);
  const repliesByParent = new Map<string, CommentView[]>();
  for (const comment of comments) {
    if (!comment.parentId) continue;
    const list = repliesByParent.get(comment.parentId) ?? [];
    list.push(comment);
    repliesByParent.set(comment.parentId, list);
  }

  return (
    <section className="flex flex-col gap-6" aria-label="Comments">
      {signedIn ? (
        <CommentForm artworkId={artworkId} />
      ) : (
        <p className="text-ink-muted text-sm">
          <Link
            href={`/sign-in?returnTo=/artwork/${artworkId}`}
            className="underline underline-offset-4"
          >
            Sign in
          </Link>{" "}
          to join the conversation.
        </p>
      )}

      {roots.length === 0 ? (
        <p className="text-ink-muted text-sm">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {roots.map((comment) => (
            <li key={comment.id}>
              <Comment
                comment={comment}
                artworkId={artworkId}
                viewerId={viewerId}
                signedIn={signedIn}
                canModerate={canModerate}
              />
              {(repliesByParent.get(comment.id)?.length ?? 0) > 0 && (
                <ul className="border-border mt-4 flex flex-col gap-4 border-l pl-4">
                  {repliesByParent.get(comment.id)!.map((reply) => (
                    <li key={reply.id}>
                      <Comment
                        comment={reply}
                        artworkId={artworkId}
                        viewerId={viewerId}
                        signedIn={signedIn}
                        canModerate={canModerate}
                        isReply
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Comment({
  comment,
  artworkId,
  viewerId,
  signedIn,
  canModerate = false,
  isReply = false,
}: {
  comment: CommentView;
  artworkId: string;
  viewerId: string | null;
  signedIn: boolean;
  canModerate?: boolean;
  isReply?: boolean;
}) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [, startTransition] = useTransition();

  if (comment.deleted) {
    return <p className="text-ink-muted text-sm italic">Comment removed</p>;
  }

  const name = comment.authorHandle ? (
    <Link href={`/artist/${comment.authorHandle}`} className="hover:underline">
      {comment.authorName}
    </Link>
  ) : (
    comment.authorName
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{name}</span>
        <time dateTime={new Date(comment.createdAt).toISOString()} className="text-ink-muted text-xs">
          {new Date(comment.createdAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}
        </time>
      </div>

      <p className="text-sm leading-6 whitespace-pre-wrap">{comment.body}</p>

      <div className="text-ink-muted flex gap-4 text-xs">
        {/* Only one level of nesting: a reply has no reply button. */}
        {signedIn && !isReply && (
          <button type="button" onClick={() => setReplying((open) => !open)} className="hover:underline">
            {replying ? "Cancel" : "Reply"}
          </button>
        )}
        {(viewerId === comment.authorId || canModerate) && (
          <button
            type="button"
            className="hover:underline"
            onClick={() =>
              startTransition(async () => {
                await deleteComment(comment.id);
                router.refresh();
              })
            }
          >
            {viewerId === comment.authorId ? "Delete" : "Remove"}
          </button>
        )}
      </div>

      {replying && (
        <div className="mt-2">
          <CommentForm
            artworkId={artworkId}
            parentId={comment.id}
            onDone={() => setReplying(false)}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

function CommentForm({
  artworkId,
  parentId,
  onDone,
  autoFocus = false,
}: {
  artworkId: string;
  parentId?: string;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;

    startTransition(async () => {
      const result = await postComment({ artworkId, body: text, parentId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      setError(null);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={`comment-${parentId ?? "root"}`}>
        {parentId ? "Write a reply" : "Write a comment"}
      </label>
      <textarea
        id={`comment-${parentId ?? "root"}`}
        value={body}
        autoFocus={autoFocus}
        onChange={(event) => setBody(event.target.value)}
        rows={parentId ? 2 : 3}
        maxLength={2000}
        placeholder={parentId ? "Write a reply…" : "Add a comment…"}
        className="border-border focus:border-ink w-full resize-y rounded border bg-transparent px-3 py-2 text-sm outline-none"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || body.trim().length === 0}
          className="bg-ink text-paper rounded px-4 py-1.5 text-sm disabled:opacity-40"
        >
          {pending ? "Posting…" : parentId ? "Reply" : "Post"}
        </button>
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
