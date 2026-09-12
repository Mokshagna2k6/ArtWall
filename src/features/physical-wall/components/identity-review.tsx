"use client";

import { useActionState } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import { reviewIdentity } from "@/features/physical-wall/actions/identity";
import {
  FormStatus,
  SubmitButton,
  inputClass,
} from "@/features/physical-wall/components/form-bits";

interface Item {
  id: string;
  user_id: string;
  doc_cloudinary_id: string;
  doc_kind: string;
  created_at: string;
  name: string;
  email: string;
}

export function IdentityReviewList({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return (
      <div className="border-hairline rounded-md border border-dashed p-10 text-center">
        <p className="text-ink-muted text-sm">No pending verifications.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.id}>
          <ReviewCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function ReviewCard({ item }: { item: Item }) {
  const [state, action] = useActionState(reviewIdentity, IDLE);

  return (
    <article className="border-hairline rounded-md border p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{item.name}</p>
          <p className="text-ink-muted text-xs">{item.email}</p>
          <p className="text-ink-muted mt-1 text-xs">
            {item.doc_kind} · Submitted{" "}
            {new Date(item.created_at).toLocaleDateString("en-IN")}
          </p>
        </div>
        <a
          href={`https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "artwall"}/image/upload/${item.doc_cloudinary_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="border-hairline-strong hover:border-ink text-small inline-flex h-9 items-center rounded-md border px-3"
        >
          View document
        </a>
      </div>

      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="verificationId" value={item.id} />
        <input
          name="note"
          placeholder="Note (optional)"
          className={`${inputClass} max-w-xs`}
        />
        <SubmitButton variant="quiet" name="verdict" value="approved">
          Approve
        </SubmitButton>
        <SubmitButton variant="danger" name="verdict" value="rejected">
          Reject
        </SubmitButton>
      </form>
      <FormStatus state={state} />
    </article>
  );
}
