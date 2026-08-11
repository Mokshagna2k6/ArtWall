"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FolderKanban,
  Grid2X2,
  LayoutDashboard,
  Menu,
  Search,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const navigation = [
  { label: "Overview", href: "/studio", icon: LayoutDashboard },
  { label: "Artworks", href: "/studio/artworks", icon: Grid2X2 },
  { label: "Collections", href: "/studio/collections", icon: FolderKanban },
  { label: "Contacts", href: "/studio/contacts", icon: Users },
  { label: "Calendar", href: "/studio/calendar", icon: CalendarDays },
  { label: "Tasks", href: "/studio/tasks", icon: ClipboardList },
];

export function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="studio-shell min-h-screen">
      <aside className={cn("studio-sidebar", open && "studio-sidebar-open")}>
        <div className="flex items-center justify-between px-6 py-6">
          <Link href="/studio" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <span className="studio-mark" aria-hidden>AW</span>
            <span className="font-heading text-lg tracking-tight">ArtWall <span className="font-sans text-xs font-medium text-studio-muted">STUDIO</span></span>
          </Link>
          <button className="studio-icon-button md:hidden" onClick={() => setOpen(false)} aria-label="Close navigation"><X /></button>
        </div>
        <div className="px-4 py-3">
          <p className="studio-eyebrow px-3 pb-3">Workspace</p>
          <nav aria-label="Studio navigation" className="flex flex-col gap-1">
            {navigation.map((item) => {
              const active = pathname === item.href || (item.href !== "/studio" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={cn("studio-nav-link", active && "studio-nav-link-active")} aria-current={active ? "page" : undefined}><Icon aria-hidden />{item.label}</Link>;
            })}
          </nav>
        </div>
        <div className="mt-auto flex flex-col gap-1 border-t border-studio-border px-4 py-5">
          <Link href="/studio/reports" className="studio-nav-link"><ClipboardList aria-hidden />Reports</Link>
          <Link href="/studio/settings" className="studio-nav-link"><Settings2 aria-hidden />Settings</Link>
        </div>
      </aside>
      {open && <button className="studio-backdrop md:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" />}
      <div className="studio-main">
        <header className="studio-topbar">
          <button className="studio-icon-button md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button>
          <div className="studio-search"><Search aria-hidden /><span>Search artworks, contacts, exhibitions</span><kbd>⌘ K</kbd></div>
          <div className="ml-auto flex items-center gap-3"><button className="studio-icon-button" aria-label="Notifications"><Bell /></button><div className="studio-avatar">AS</div><button className="hidden items-center gap-1 text-sm font-medium text-studio-ink md:flex">Aarav Sharma<ChevronDown /></button></div>
        </header>
        <main className="studio-content">{children}</main>
      </div>
    </div>
  );
}

export function StudioPageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-5 border-b border-studio-border pb-7 md:flex-row md:items-end md:justify-between"><div><p className="studio-eyebrow">{eyebrow}</p><h1 className="mt-2 text-4xl tracking-tight text-studio-ink md:text-5xl">{title}</h1>{description && <p className="mt-3 max-w-2xl text-sm leading-6 text-studio-muted">{description}</p>}</div>{action}</div>;
}

export function StudioMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="studio-card flex flex-col gap-3 p-5"><p className="studio-eyebrow">{label}</p><p className="font-heading text-3xl tracking-tight text-studio-ink">{value}</p><p className="text-xs text-studio-muted">{detail}</p></div>;
}

export function StudioEmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="studio-empty"><div className="studio-empty-mark"><Grid2X2 aria-hidden /></div><h2 className="mt-5 text-xl text-studio-ink">{title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-studio-muted">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

export function StudioButton({ children, href }: { children: ReactNode; href?: string }) {
  const className = "studio-button";
  return href ? <Link href={href} className={className}>{children}</Link> : <button className={className}>{children}</button>;
}
