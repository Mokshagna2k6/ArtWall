"use client";
import { useState, useTransition } from "react";
import { createContact } from "@/app/actions/contacts";
import { createCollection } from "@/app/actions/organization";
import {
  createDocument,
  createRoom,
  createSale,
} from "@/app/actions/workspaces";

type Kind = "sale" | "document" | "room" | "contact" | "collection";

const LABEL: Record<Kind, string> = {
  sale: "Opportunity",
  document: "Document",
  room: "Room",
  contact: "Contact",
  collection: "Collection",
};

export function WorkspaceCreateForm({ kind }: { kind: Kind }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = LABEL[kind];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        if (kind === "sale")
          await createSale({
            status: "lead",
            amount: value ? Math.round(Number(value)) : undefined,
          });
        if (kind === "document")
          await createDocument({ title: value, kind: "archive" });
        if (kind === "room")
          await createRoom({
            name: value,
            slug: value.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          });
        if (kind === "contact") await createContact({ name: value });
        if (kind === "collection") await createCollection({ name: value });
        setValue("");
        setOpen(false);
      } catch {
        setError(`Could not save this ${label.toLowerCase()}. Try again.`);
      }
    });
  }

  return open ? (
    <form onSubmit={submit} className="studio-card flex flex-wrap gap-3 p-4">
      {kind === "sale" ? (
        <input
          autoFocus
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="studio-input flex-1"
          placeholder="Amount in ₹ (optional)"
          aria-label="Amount in rupees"
        />
      ) : (
        <input
          autoFocus
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="studio-input flex-1"
          placeholder={`${label} name`}
          aria-label={`${label} name`}
        />
      )}
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
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
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
