"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BadgeCheck, Grid2X2, Search, Tag } from "lucide-react";

import { CloudinaryImage as Image } from "@/components/media/cloudinary-image";
import { cn } from "@/lib/utils";

/**
 * The Overview's tabbed work list (§8.2) — what replaces a standalone Artworks
 * page in the sidebar. One flat row shape for all three kinds so filter, sort
 * and search are written once rather than per tab.
 */
export type WorkKind = "artwork" | "certificate" | "tag";

export interface WorkRow {
  id: string;
  kind: WorkKind;
  title: string;
  /** Status word shown as the row's eyebrow, already lower-cased by the caller. */
  status: string;
  /** Secondary line: medium/dimensions, certificate hash, tag uid. */
  detail: string;
  imageUrl: string | null;
  /** ISO timestamp — sort key for "newest"/"oldest". */
  createdAt: string;
  href: string;
}

const TABS: { id: "all" | WorkKind; label: string; icon: typeof Grid2X2 }[] = [
  { id: "all", label: "All", icon: Grid2X2 },
  { id: "artwork", label: "Artworks", icon: Grid2X2 },
  { id: "certificate", label: "Certificates", icon: BadgeCheck },
  { id: "tag", label: "Tags", icon: Tag },
];

type Sort = "newest" | "oldest" | "title";

export function StudioWorkList({ rows }: { rows: WorkRow[] }) {
  const [tab, setTab] = useState<"all" | WorkKind>("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [query, setQuery] = useState("");

  const inTab = useMemo(
    () => (tab === "all" ? rows : rows.filter((row) => row.kind === tab)),
    [rows, tab]
  );

  // Filter options come from what is actually in this tab, so the dropdown can
  // never offer a status that would return nothing.
  const statuses = useMemo(
    () => [...new Set(inTab.map((row) => row.status))].sort(),
    [inTab]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = inTab.filter(
      (row) =>
        (status === "all" || row.status === status) &&
        (needle === "" ||
          row.title.toLowerCase().includes(needle) ||
          row.detail.toLowerCase().includes(needle))
    );
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      return sort === "oldest" ? diff : -diff;
    });
    return sorted;
  }, [inTab, status, sort, query]);

  return (
    <section className="studio-card p-6 md:p-8" aria-label="Your work">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Work type">
          {TABS.map(({ id, label, icon: Icon }) => {
            const count = id === "all" ? rows.length : rows.filter((r) => r.kind === id).length;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => {
                  setTab(id);
                  setStatus("all");
                }}
                className={cn(
                  "border-studio-border flex items-center gap-2 rounded border px-3 py-2 text-sm",
                  tab === id
                    ? "bg-studio-ink text-studio-surface border-transparent font-semibold"
                    : "text-studio-muted hover:text-studio-ink"
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
                <span className="text-xs opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="relative flex-1 min-w-[12rem]">
            <span className="sr-only">Search your work</span>
            <Search
              aria-hidden
              className="text-studio-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or detail"
              className="studio-input w-full pl-9"
            />
          </label>
          <label className="text-studio-muted flex items-center gap-2 text-sm">
            Filter
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="studio-input py-2"
            >
              <option value="all">All statuses</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="text-studio-muted flex items-center gap-2 text-sm">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="studio-input py-2"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>
        </div>

        {visible.length === 0 ? (
          <p className="text-studio-muted py-10 text-center text-sm">
            {rows.length === 0
              ? "Nothing here yet. Add a work to start the record."
              : "No matches. Try a different search or filter."}
          </p>
        ) : (
          <ul className="divide-studio-border flex flex-col divide-y">
            {visible.map((row) => (
              <li key={`${row.kind}:${row.id}`}>
                <Link
                  href={row.href}
                  className="hover:bg-studio-bg flex items-center gap-4 py-4 transition-colors"
                >
                  <div className="bg-muted relative size-14 shrink-0 overflow-hidden rounded">
                    {row.imageUrl ? (
                      <Image
                        src={row.imageUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    ) : (
                      <span className="text-studio-muted flex h-full items-center justify-center text-[0.6rem]">
                        No image
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-studio-ink truncate font-medium">{row.title}</p>
                    <p className="text-studio-muted mt-0.5 truncate text-sm">{row.detail}</p>
                  </div>
                  <span className="studio-eyebrow shrink-0">{row.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
