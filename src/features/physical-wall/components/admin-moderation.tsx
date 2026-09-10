"use client";

import { useActionState, useState } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import { moderateUgc, listPendingUgc } from "@/features/physical-wall/actions/ugc";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";

export function AdminModeration() {
  const [items, setItems] = useState<
    { id: string; caption: string; imageUrl: string; cloudinaryId: string; kind: string; createdAt: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const data = await listPendingUgc();
    setItems(data);
    setLoading(false);
  }

  useState(() => {
    refresh();
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-section">Community moderation</h2>
          <p className="text-ink-muted mt-1 text-sm leading-6">
            Only approved UGC appears on the public gallery. Withdrawal →
            delete + CDN purge.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="border-hairline-strong hover:border-ink text-small inline-flex h-10 items-center rounded-md border px-4"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {items.length === 0 && !loading ? (
        <div className="border-hairline rounded-md border border-dashed p-10 text-center">
          <p className="text-ink-muted text-sm">Queue empty.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id}>
              <article className="border-hairline rounded-md border p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink-muted text-xs">
                      {new Date(item.createdAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                    <p className="text-ink-muted text-xs mt-1">
                      {item.kind === "selfie" ? "Selfie" : "Community"} · Cloudinary: {item.cloudinaryId}
                    </p>
                    <p className="text-ink mt-1 text-sm">
                      {item.caption || "No caption"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-md border">
                  <img
                    src={item.imageUrl}
                    alt="UGC submission"
                    className="h-64 w-full object-cover"
                  />
                </div>

                <div className="mt-5 flex flex-wrap gap-6">
                  <ApproveForm submissionId={item.id} onDone={refresh} />
                  <RemoveForm submissionId={item.id} onDone={refresh} />
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ApproveForm({
  submissionId,
  onDone,
}: {
  submissionId: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState(moderateUgc, IDLE);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="verdict" value="approved" />
      <SubmitButton variant="quiet">Approve</SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}

function RemoveForm({
  submissionId,
  onDone,
}: {
  submissionId: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState(moderateUgc, IDLE);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="verdict" value="removed" />
      <SubmitButton variant="danger">Remove</SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}
