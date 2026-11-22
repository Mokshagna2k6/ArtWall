"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FolderKanban,
  GalleryHorizontal,
  Grid2X2,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  ShoppingBag,
  Tag,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type NavLeaf = { label: string; href: string; icon: typeof LayoutDashboard };
type NavItem = NavLeaf & { children?: NavLeaf[] };

/**
 * Six entries, not ten (§8.3/§8.4). Artworks is deliberately not a top-level
 * item — the Overview's tabbed work list is its entry point — but it stays a
 * child of Works so the existing /studio/artworks route keeps a nav home.
 */
const navigation: NavItem[] = [
  { label: "Overview", href: "/studio", icon: LayoutDashboard },
  {
    label: "Works",
    href: "/studio/artworks",
    icon: Grid2X2,
    children: [
      { label: "Artworks", href: "/studio/artworks", icon: Grid2X2 },
      { label: "Collections", href: "/studio/collections", icon: FolderKanban },
      { label: "Certificates", href: "/studio/certificates", icon: BadgeCheck },
      { label: "Tags / NFTs", href: "/studio/tags", icon: Tag },
    ],
  },
  {
    label: "Programme",
    href: "/studio/exhibitions",
    icon: GalleryHorizontal,
    children: [
      { label: "Exhibitions", href: "/studio/exhibitions", icon: GalleryHorizontal },
      { label: "Calendar", href: "/studio/calendar", icon: CalendarDays },
      { label: "Tasks", href: "/studio/tasks", icon: ClipboardList },
    ],
  },
  { label: "Contacts", href: "/studio/contacts", icon: Users },
];

/** A group is open when the current page is inside it; otherwise collapsed. */
function containsPath(item: NavItem, pathname: string): boolean {
  const hrefs = item.children?.map((c) => c.href) ?? [item.href];
  return hrefs.some(
    (href) => pathname === href || (href !== "/studio" && pathname.startsWith(`${href}/`))
  );
}

export function StudioShell({
  children,
  artistName,
  avatarUrl,
  showOrders = false,
}: {
  children: ReactNode;
  artistName: string;
  avatarUrl: string | null;
  /** Marketplace checkout is on: show the seller's Orders inbox. */
  showOrders?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="studio-shell min-h-screen">
      <aside className={cn("studio-sidebar", open && "studio-sidebar-open")}>
        <div className="flex items-center justify-between px-6 py-6">
          <Link
            href="/studio"
            className="flex items-center gap-3"
            onClick={() => setOpen(false)}
          >
            <span className="studio-mark" aria-hidden>
              AW
            </span>
            <span className="font-heading text-lg tracking-tight">
              ArtWall{" "}
              <span className="text-studio-muted font-sans text-xs font-medium">
                STUDIO
              </span>
            </span>
          </Link>
          <button
            className="studio-icon-button md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>
        <div className="px-6 pb-3">
          <Link
            href="/"
            className="text-studio-muted hover:text-studio-ink text-sm underline underline-offset-4"
            onClick={() => setOpen(false)}
          >
            ← Back to ArtWall
          </Link>
        </div>
        <div className="px-4 py-3">
          <p className="studio-eyebrow px-3 pb-3">Workspace</p>
          <nav aria-label="Studio navigation" className="flex flex-col gap-1">
            {(showOrders
              ? [...navigation, { label: "Orders", href: "/studio/orders", icon: ShoppingBag }]
              : navigation
            ).map((item) => (
              <StudioNavItem
                // Re-keyed on pathname so a group re-collapses/expands to match
                // the new page after a client-side navigation.
                key={`${item.label}:${pathname}`}
                item={item}
                pathname={pathname}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </nav>
        </div>
        <div className="border-studio-border mt-auto flex flex-col gap-1 border-t px-4 py-5">
          <Link href="/studio/reports" className="studio-nav-link">
            <ClipboardList aria-hidden />
            Reports
          </Link>
          <Link href="/studio/settings" className="studio-nav-link">
            <Settings2 aria-hidden />
            Settings
          </Link>
        </div>
      </aside>
      {open && (
        <button
          className="studio-backdrop md:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <div className="studio-main">
        <header className="studio-topbar">
          <button
            className="studio-icon-button md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div className="ml-auto flex items-center gap-3">
            {avatarUrl ? (
              <div className="studio-avatar relative overflow-hidden rounded-full">
                <Image
                  src={avatarUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="32px"
                />
              </div>
            ) : (
              <div className="studio-avatar rounded-full">
                {artistName
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase()}
              </div>
            )}
            <StudioAccountMenu artistName={artistName} />
          </div>
        </header>
        <main className="studio-content">{children}</main>
      </div>
    </div>
  );
}

/** One sidebar row: a plain link, or a group that expands to its children. */
function StudioNavItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const inGroup = containsPath(item, pathname);
  // Local so a user can open a group they are not currently inside; the caller
  // re-keys this component on pathname, so navigation resets it to `inGroup`.
  const [expanded, setExpanded] = useState(inGroup);
  const Icon = item.icon;

  if (!item.children) {
    const active =
      pathname === item.href ||
      (item.href !== "/studio" && pathname.startsWith(item.href));
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        className={cn("studio-nav-link", active && "studio-nav-link-active")}
        aria-current={active ? "page" : undefined}
      >
        <Icon aria-hidden />
        {item.label}
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={cn(
          "studio-nav-link w-full text-left",
          inGroup && "studio-nav-link-active"
        )}
      >
        <Icon aria-hidden />
        {item.label}
        <ChevronDown
          aria-hidden
          className={cn("ml-auto transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="border-studio-border ml-5 flex flex-col gap-1 border-l pl-2">
          {item.children.map((child) => {
            const active =
              pathname === child.href || pathname.startsWith(`${child.href}/`);
            const ChildIcon = child.icon;
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                className={cn(
                  "studio-nav-link text-sm",
                  active && "studio-nav-link-active"
                )}
                aria-current={active ? "page" : undefined}
              >
                <ChildIcon aria-hidden />
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StudioAccountMenu({ artistName }: { artistName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
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

  const handleSignOut = useCallback(async () => {
    setPending(true);
    try {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }, [router]);

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-studio-ink flex items-center gap-1 text-sm font-medium"
      >
        {artistName}
        <ChevronDown />
      </button>
      {open && (
        <div className="border-studio-border shadow-medium absolute right-0 top-[calc(100%+0.75rem)] w-48 border bg-white p-2">
          <Link
            href="/studio/settings"
            onClick={() => setOpen(false)}
            className="hover:bg-secondary flex items-center gap-2 px-3 py-2 text-sm transition-colors"
          >
            <Settings2 aria-hidden className="size-4" />
            Settings
          </Link>
          <div className="border-studio-border my-1 border-t" />
          <button
            type="button"
            onClick={handleSignOut}
            disabled={pending}
            className="hover:bg-secondary flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
          >
            <LogOut aria-hidden className="size-4" />
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

export function StudioPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-studio-border flex flex-col gap-5 border-b pb-7 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="studio-eyebrow">{eyebrow}</p>
        <h1 className="text-studio-ink text-display mt-2">{title}</h1>
        {description && (
          <p className="text-studio-muted mt-3 max-w-2xl text-sm leading-6">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function StudioMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="studio-card flex flex-col gap-3 p-5">
      <p className="studio-eyebrow">{label}</p>
      <p className="font-heading text-studio-ink text-section">{value}</p>
      <p className="text-studio-muted text-xs">{detail}</p>
    </div>
  );
}

export function StudioEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="studio-empty">
      <div className="studio-empty-mark">
        <Grid2X2 aria-hidden />
      </div>
      <h2 className="text-studio-ink text-card mt-5">{title}</h2>
      <p className="text-studio-muted mt-2 max-w-md text-sm leading-6">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Honest placeholder for a studio module that has no backend yet. */
export function StudioNotAvailable({ what }: { what: string }) {
  return (
    <div className="studio-card">
      <StudioEmptyState
        title="Not yet available"
        description={`${what} isn't built yet. Nothing here is saved or tracked, and no data on this page is real. It will appear here once it ships.`}
      />
    </div>
  );
}

export function StudioButton({
  children,
  href,
}: {
  children: ReactNode;
  href?: string;
}) {
  const className = "studio-button";
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <button className={className}>{children}</button>
  );
}
