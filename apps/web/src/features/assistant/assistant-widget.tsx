"use client";

import { MessageCircle, Send, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { escalateToHuman } from "@/features/assistant/actions";
import { cn } from "@/lib/utils";

/**
 * The bottom-right assistant launcher and panel (CHANGES-PLAN §8.1).
 *
 * This component never sees the API key — it posts to /api/assistant, which
 * holds it server-side. It is rendered only when the server has decided the
 * feature is available (see the layout), so a missing ANTHROPIC_API_KEY means
 * no launcher at all rather than a button that fails.
 */

const MESSAGE_MAX_CHARS = 1000;

interface Turn {
  role: "user" | "assistant";
  content: string;
}

export function AssistantWidget({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escalated, setEscalated] = useState<string | null>(null);
  const [escalating, startEscalation] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, streaming]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send() {
    const question = draft.trim();
    if (!question || streaming) return;

    const history = [...turns, { role: "user" as const, content: question }];
    setTurns(history);
    setDraft("");
    setError(null);
    setStreaming(true);
    // The assistant turn is appended empty and filled as the stream arrives.
    setTurns([...history, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        setTurns(history);
        setError(
          (payload as { error?: string } | null)?.error ??
            "The assistant could not answer. Please try again."
        );
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setTurns([...history, { role: "assistant", content: text }]);
      }
    } catch {
      setTurns(history);
      setError("The connection dropped. Please try again.");
    } finally {
      setStreaming(false);
    }
  }

  function escalate() {
    // The last thing the visitor asked is the question for the human.
    const lastQuestion = [...turns].reverse().find((t) => t.role === "user")?.content;
    if (!lastQuestion) return;
    setError(null);
    startEscalation(async () => {
      const result = await escalateToHuman({ question: lastQuestion, transcript: turns });
      if (result.ok) setEscalated(result.data.inquiryId);
      else setError(result.error);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask the ArtWall assistant"
        className="bg-ink text-paper fixed right-5 bottom-5 z-40 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105"
      >
        <MessageCircle aria-hidden className="size-6" />
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="ArtWall assistant"
      className="border-hairline fixed right-5 bottom-5 z-40 flex max-h-[min(32rem,80vh)] w-[min(24rem,calc(100vw-2.5rem))] flex-col rounded-lg border bg-white shadow-xl"
    >
      <header className="border-hairline flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">ArtWall assistant</p>
          <p className="text-ink-muted text-xs">Answers about ArtWall. Not advice on a specific work.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close assistant"
          className="text-ink-muted hover:text-ink"
        >
          <X aria-hidden className="size-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {turns.length === 0 && (
          <p className="text-ink-muted text-sm leading-6">
            Ask about certification, exhibitions, the Wall, commission or how ArtWall works. For
            anything about a specific artwork&rsquo;s authenticity or price, I&rsquo;ll point you
            to a person.
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {turns.map((turn, i) => (
            <li
              key={i}
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                turn.role === "user" ? "bg-ink text-paper ml-auto" : "bg-band text-ink"
              )}
            >
              {turn.content ||
                (streaming && turn.role === "assistant" ? (
                  <span className="text-ink-muted">Thinking…</span>
                ) : null)}
            </li>
          ))}
        </ul>

        {error && (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {error}
          </p>
        )}

        {escalated && (
          <p role="status" className="text-ink-muted mt-3 text-sm">
            Passed to the ArtWall team. You can follow the reply in{" "}
            <Link href="/studio/contacts" className="underline">
              your conversations
            </Link>
            .
          </p>
        )}

        <div ref={endRef} />
      </div>

      <footer className="border-hairline border-t px-4 py-3">
        {turns.some((t) => t.role === "user") && !escalated && (
          <div className="mb-2">
            {signedIn ? (
              <button
                type="button"
                onClick={escalate}
                disabled={escalating}
                className="text-ink-muted hover:text-ink text-xs underline"
              >
                {escalating ? "Passing to the team…" : "Ask a person instead"}
              </button>
            ) : (
              <Link href="/sign-in?callbackUrl=%2F" className="text-ink-muted text-xs underline">
                Sign in to ask a person
              </Link>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="sr-only">Your question</span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              maxLength={MESSAGE_MAX_CHARS}
              placeholder="Ask about ArtWall…"
              className="border-hairline w-full resize-none rounded border px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </label>
          <button
            type="button"
            onClick={() => void send()}
            disabled={streaming || draft.trim().length === 0}
            aria-label="Send"
            className="bg-ink text-paper flex size-9 shrink-0 items-center justify-center rounded disabled:opacity-40"
          >
            <Send aria-hidden className="size-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
