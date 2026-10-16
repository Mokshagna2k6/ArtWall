"use client";

import { useEffect, useState, useTransition } from "react";

import { CloudinaryImage as Image } from "@/components/media/cloudinary-image";
import {
  getInquiryThread,
  markInquiryRead,
  replyToInquiry,
  type InquiryMessageView,
  type InquiryThread,
} from "@/features/inquiries/actions";
import { cn } from "@/lib/utils";

const BODY_MAX = 2000;

/**
 * The inquiry inbox and thread view in /studio/contacts (§8.5).
 *
 * The owner only ever sees the counterpart's display name — no email address
 * appears in these props or anywhere in the thread (Bible §A13: the sender's
 * identity beyond a name, and the owner's contact details, stay private; the
 * platform relays). Replies go through `replyToInquiry`, which re-checks
 * participation server-side.
 */
export function InquiryInbox({ threads }: { threads: InquiryThread[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (threads.length === 0) {
    return (
      <p className="text-studio-muted text-sm">
        No inquiries yet. When someone asks about one of your works, the conversation appears
        here.
      </p>
    );
  }

  return (
    <ul className="divide-studio-border flex flex-col divide-y">
      {threads.map((thread) => (
        <li key={thread.id} className="py-4">
          <InquiryRow
            thread={thread}
            open={openId === thread.id}
            onToggle={() => setOpenId((current) => (current === thread.id ? null : thread.id))}
          />
        </li>
      ))}
    </ul>
  );
}

function InquiryRow({
  thread,
  open,
  onToggle,
}: {
  thread: InquiryThread;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hover:bg-studio-bg flex w-full items-center gap-4 rounded p-2 text-left transition-colors"
      >
        <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded">
          {thread.artworkImage ? (
            <Image
              src={thread.artworkImage}
              alt=""
              fill
              className="object-cover"
              sizes="48px"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-studio-ink flex items-center gap-2 truncate font-medium">
            {thread.counterpartName}
            {thread.unread && (
              <span className="bg-studio-accent text-studio-surface rounded-full px-2 py-0.5 text-[0.65rem] font-semibold">
                New
              </span>
            )}
          </p>
          <p className="text-studio-muted mt-0.5 truncate text-sm">
            {thread.incoming ? "Asked about" : "You asked about"} &ldquo;{thread.artworkTitle}
            &rdquo;
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="studio-eyebrow">{thread.status}</p>
          <p className="text-studio-muted mt-1 text-xs">
            {new Date(thread.lastMessageAt).toLocaleDateString("en-IN")}
          </p>
        </div>
      </button>

      {open && <InquiryThreadView thread={thread} />}
    </div>
  );
}

function InquiryThreadView({ thread }: { thread: InquiryThread }) {
  const [messages, setMessages] = useState<InquiryMessageView[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await getInquiryThread(thread.id);
      if (!cancelled) setMessages(rows);
    })();
    // Opening an incoming thread is what "read" means.
    if (thread.incoming && thread.unread) void markInquiryRead(thread.id);
    return () => {
      cancelled = true;
    };
  }, [thread.id, thread.incoming, thread.unread]);

  function send() {
    setError(null);
    start(async () => {
      const result = await replyToInquiry({ inquiryId: thread.id, body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      setMessages(await getInquiryThread(thread.id));
    });
  }

  const trimmed = body.trim();

  return (
    <div className="border-studio-border mt-3 ml-2 border-l pl-4">
      {messages === null ? (
        <p className="text-studio-muted py-4 text-sm">Loading conversation…</p>
      ) : (
        <ul className="flex flex-col gap-3 py-2">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-lg px-4 py-3 text-sm",
                message.mine
                  ? "bg-studio-ink text-studio-surface ml-auto"
                  : "bg-studio-bg text-studio-ink"
              )}
            >
              <p className="whitespace-pre-wrap">{message.body}</p>
              <p className="mt-1.5 text-xs opacity-70">
                {message.mine ? "You" : message.authorName} ·{" "}
                {new Date(message.createdAt).toLocaleString("en-IN")}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="sr-only">Your reply</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={BODY_MAX}
            placeholder="Write a reply…"
            className="studio-input"
          />
        </label>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-studio-muted text-xs">
            {trimmed.length} / {BODY_MAX} · Replies are relayed through ArtWall. Your email
            address is never shared.
          </span>
          <button
            type="button"
            className="studio-button"
            disabled={pending || trimmed.length === 0}
            onClick={send}
          >
            {pending ? "Sending…" : "Send reply"}
          </button>
        </div>
      </div>
    </div>
  );
}
