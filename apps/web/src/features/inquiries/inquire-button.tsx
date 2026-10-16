"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { createInquiry } from "@/features/inquiries/actions";

const BODY_MAX = 2000;

/**
 * "Inquire about work" plus its modal (CHANGES-PLAN §8.5, reference image 4).
 *
 * Sending requires sign-in (decided 2026-10-15), so with no session this is a
 * link to /sign-in and never a modal that collects a message it cannot send.
 * The name field is therefore not typed: it is the account's name, shown
 * read-only, which is what the server records as the sender.
 *
 * The owner's email address is never in this component's props or its reply —
 * the platform relays. See features/inquiries/actions.ts.
 */
export function InquireButton({
  artworkId,
  artworkTitle,
  artistName,
  /** The signed-in viewer's name, or null when logged out. */
  viewerName,
  signInHref,
}: {
  artworkId: string;
  artworkTitle: string;
  artistName: string;
  viewerName: string | null;
  signInHref: string;
}) {
  if (!viewerName) {
    return (
      <Link href={signInHref} className="studio-button">
        Inquire about work
      </Link>
    );
  }
  return (
    <InquireModal
      artworkId={artworkId}
      artworkTitle={artworkTitle}
      artistName={artistName}
      viewerName={viewerName}
    />
  );
}

function InquireModal({
  artworkId,
  artworkTitle,
  artistName,
  viewerName,
}: {
  artworkId: string;
  artworkTitle: string;
  artistName: string;
  viewerName: string;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(
    `I am interested in "${artworkTitle}" by ${artistName}. Could you tell me more about it?`
  );
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function send() {
    setError(null);
    start(async () => {
      const result = await createInquiry({ artworkId, body });
      if (result.ok) setSent(true);
      else setError(result.error);
    });
  }

  const tooLong = body.trim().length > BODY_MAX;
  const empty = body.trim().length === 0;

  return (
    <>
      <button type="button" className="studio-button" onClick={() => setOpen(true)}>
        Inquire about work
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inquire-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
          >
            {sent ? (
              <>
                <h2 id="inquire-title" className="font-heading text-card">
                  Message sent
                </h2>
                <p className="text-ink-muted mt-3 text-sm leading-6">
                  {artistName} has it in their ArtWall inbox. Any reply comes back through
                  ArtWall — you will see it in your conversations.
                </p>
                <div className="mt-6 flex justify-end">
                  <button type="button" className="studio-button" onClick={() => setOpen(false)}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="inquire-title" className="font-heading text-card">
                  Inquire about this work
                </h2>
                <p className="text-ink-muted mt-2 text-sm">
                  Sent to the owner of &ldquo;{artworkTitle}&rdquo;. Your message is relayed
                  through ArtWall — neither of you sees the other&rsquo;s email address.
                </p>

                <div className="mt-5 flex flex-col gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs uppercase tracking-wide">From</span>
                    {/* Not editable: the sender is the account, which is what
                        makes this rate-limitable and accountable. */}
                    <input
                      value={viewerName}
                      readOnly
                      aria-describedby="inquire-from-note"
                      className="studio-input bg-band"
                    />
                    <span id="inquire-from-note" className="text-ink-muted text-xs">
                      Sent as your ArtWall account.
                    </span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs uppercase tracking-wide">Message</span>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={6}
                      maxLength={BODY_MAX}
                      className="studio-input"
                    />
                    <span
                      className={
                        tooLong ? "text-destructive text-xs" : "text-ink-muted text-xs"
                      }
                    >
                      {body.trim().length} / {BODY_MAX}
                    </span>
                  </label>
                </div>

                {error && (
                  <p role="alert" className="text-destructive mt-3 text-sm">
                    {error}
                  </p>
                )}

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    className="text-ink-muted text-sm underline"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="studio-button"
                    disabled={pending || empty || tooLong}
                    onClick={send}
                  >
                    {pending ? "Sending…" : "Send message"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
