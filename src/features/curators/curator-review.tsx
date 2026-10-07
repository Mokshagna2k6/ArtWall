"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveCurator, rejectCurator, suspendCurator } from "@/features/curators/actions";
import type { Result } from "@/features/physical-wall/action-state";
import { ConfirmStep } from "@/features/physical-wall/components/form-bits";

type Item = {
  id: string;
  displayName: string;
  bio: string | null;
  status: string;
  commissionBps: number;
  createdAt: string;
  email: string;
};

export function CuratorReviewList({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return (
      <p className="border-hairline text-ink-muted rounded-md border border-dashed p-6 text-sm">
        No pending or active curators.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <CuratorRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

function CuratorRow({ item }: { item: Item }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  function run(fn: () => Promise<Result<{ status: string; commissionBps: number }>>) {
    setResult(null);
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) return setResult({ ok: false, text: res.error });
        const r = res.data;
        setResult({
          ok: true,
          text:
            r.status === "active"
              ? `Approved · commission ${(r.commissionBps / 100).toFixed(2)}%.`
              : `Now ${r.status}.`,
        });
        router.refresh();
      } catch (error) {
        setResult({
          ok: false,
          text: error instanceof Error ? error.message : "That did not work.",
        });
      }
    });
  }

  return (
    <li
      className="border-hairline rounded-md border p-5"
      data-testid={`curator-${item.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{item.displayName}</p>
          <p className="text-ink-muted text-xs">
            {item.email} · applied{" "}
            {new Date(item.createdAt).toLocaleDateString("en-IN")}
          </p>
          {item.bio && (
            <p className="text-ink-muted mt-2 text-sm">{item.bio}</p>
          )}
        </div>
        <span className="text-label border-hairline-strong rounded-full border px-3 py-1 tracking-wider uppercase">
          {item.status}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {item.status === "pending" && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => approveCurator(item.id))}
              className="bg-ember text-wall-paper text-small h-10 rounded-md px-4 font-medium disabled:opacity-60"
            >
              {pending ? "Working…" : "Approve"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => rejectCurator(item.id))}
              className="border-destructive/40 text-destructive text-small h-10 rounded-md border px-4 font-medium disabled:opacity-60"
            >
              {pending ? "Working…" : "Reject"}
            </button>
          </>
        )}
        {item.status === "active" && (
          <>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for suspending"
              aria-label={`Reason for suspending ${item.displayName}`}
              className="border-hairline focus:border-ink h-10 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none"
            />
            <ConfirmStep
              label="Suspend"
              disabled={pending || !reason.trim()}
              warning={`Suspend ${item.displayName}? They lose curator access until reinstated.`}
            >
              <button
                type="button"
                disabled={pending || !reason.trim()}
                onClick={() => run(() => suspendCurator(item.id, reason))}
                className="border-destructive/40 text-destructive text-small h-10 rounded-md border px-4 font-medium disabled:opacity-60"
              >
                {pending ? "Working…" : "Confirm suspend"}
              </button>
            </ConfirmStep>
          </>
        )}
      </div>
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`mt-3 text-sm ${result.ok ? "text-signal" : "text-destructive"}`}
        >
          {result.text}
        </p>
      )}
    </li>
  );
}
