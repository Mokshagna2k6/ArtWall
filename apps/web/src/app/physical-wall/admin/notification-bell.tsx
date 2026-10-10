"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import type { AuditLogRow } from "@/features/physical-wall/audit";

/**
 * FE-3.19: the admin shell header's notification bell. Pure client-side
 * dropdown toggle over data the server component (layout.tsx) already
 * fetched — same "no new infrastructure" reasoning as the count query
 * itself: no polling, no websocket, just revealing rows that were already
 * part of this page's render.
 */
export function NotificationBell({
  count,
  recent,
}: {
  count: number;
  recent: AuditLogRow[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Recent activity${count > 0 ? ` (${count} in the last 24h)` : ""}`}
        className="text-ink-muted hover:bg-band hover:text-ink relative flex size-9 items-center justify-center rounded-md transition-colors"
      >
        <Bell className="size-4.5" aria-hidden />
        {count > 0 && (
          <span className="bg-ink absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[0.65rem] font-medium text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div className="border-hairline shadow-medium absolute top-[calc(100%+0.5rem)] right-0 z-50 w-80 rounded-md border bg-white p-2">
          <p className="text-label text-ink-muted px-2 py-1.5 tracking-wider uppercase">
            Recent activity
          </p>
          {recent.length === 0 ? (
            <p className="text-ink-muted px-2 py-4 text-center text-sm">
              Nothing recorded yet.
            </p>
          ) : (
            <ul className="flex max-h-80 flex-col overflow-y-auto">
              {recent.map((entry) => (
                <li key={entry.id} className="border-hairline border-t px-2 py-2 first:border-t-0">
                  <p className="text-sm">
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-ink-muted ml-1.5 text-xs">
                      {entry.actor_label ?? "system"}
                    </span>
                  </p>
                  <time className="text-ink-muted text-xs tabular-nums">
                    {new Date(entry.created_at).toLocaleString("en-IN")}
                  </time>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/physical-wall/admin/audit"
            onClick={() => setOpen(false)}
            className="text-ink-muted hover:text-ink mt-1 block px-2 py-1.5 text-xs underline underline-offset-4"
          >
            Full audit log
          </Link>
        </div>
      )}
    </div>
  );
}
