"use client";
import { useState, useTransition } from "react";
import {
  createDocument,
  createRoom,
  createSale,
} from "@/app/actions/workspaces";
export function WorkspaceCreateForm({
  kind,
}: {
  kind: "sale" | "document" | "room";
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const label =
    kind === "sale" ? "Opportunity" : kind === "document" ? "Document" : "Room";
  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      if (kind === "sale") await createSale({ status: "lead" });
      if (kind === "document")
        await createDocument({ title: name, kind: "archive" });
      if (kind === "room")
        await createRoom({
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        });
      setName("");
      setOpen(false);
    });
  }
  return open ? (
    <form onSubmit={submit} className="studio-card flex gap-3 p-4">
      <input
        autoFocus
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="studio-input flex-1"
        placeholder={`${label} name`}
      />
      <button disabled={pending} className="studio-button">
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="studio-icon-button"
        aria-label="Cancel"
      >
        ×
      </button>
    </form>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="studio-button"
    >
      Add {label.toLowerCase()}
    </button>
  );
}
