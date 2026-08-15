import Link from "next/link";
import {
  CalendarDays,
  ClipboardCheck,
  FileText,
  LayoutGrid,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { getSessionUser } from "@/lib/session";
import {
  requireRolePage,
  syncAdminAllowlist,
} from "@/features/physical-wall/authorize";

const ITEMS = [
  { href: "/physical-wall/admin", label: "Overview", icon: TrendingUp },
  { href: "/physical-wall/admin/grid", label: "Wall map", icon: LayoutGrid },
  { href: "/physical-wall/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/physical-wall/admin/bookings", label: "Bookings", icon: FileText },
  { href: "/physical-wall/admin/queue", label: "Queue", icon: Users },
  { href: "/physical-wall/admin/catalogs", label: "Pricing", icon: Wallet },
  { href: "/physical-wall/admin/ledger", label: "Ledger", icon: ClipboardCheck },
] as const;

/**
 * The admin console.
 *
 * A left rail rather than tabs, following the prototype. Five destinations that
 * a founder moves between constantly is one too many for a tab strip, and a
 * rail keeps the current section visible while a wide table or the wall map
 * uses the full width beside it. It collapses to a horizontal scroller on a
 * phone, where a fixed 13rem column would eat a third of the screen.
 *
 * The allowlist sync runs before the role check, and that order is the
 * bootstrap: the first founder has no admin role yet, so checking first would
 * lock them out of the only screen that could grant it.
 */
export default async function PhysicalWallAdminLayout({
  children,
}: LayoutProps<"/physical-wall/admin">) {
  const user = await getSessionUser();
  if (user) await syncAdminAllowlist(user);

  const actor = await requireRolePage("admin", "/physical-wall/admin");

  return (
    <div className="mx-auto max-w-7xl px-5 pt-24 pb-24 sm:px-8 sm:pt-28">
      <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-label text-ink-muted tracking-wider uppercase">
            Wall management
          </p>

          <nav aria-label="Wall management" className="mt-4">
            <ul className="-mx-1 flex gap-1 overflow-x-auto pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0">
              {ITEMS.map((item) => (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    className="text-ink-muted hover:bg-band hover:text-ink flex items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors"
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Who you are, stated plainly. Every force action on these screens is
              written to the audit log under this name, and it is fairer to say
              so before someone uses one than afterwards. */}
          <div className="border-hairline mt-6 hidden rounded-md border p-3 lg:block">
            <p className="text-label text-ink-muted tracking-wider uppercase">
              Signed in as
            </p>
            <p className="mt-1.5 text-sm font-medium">{actor.name}</p>
            <p className="text-ink-muted mt-1 text-xs leading-5">
              Admin — force actions, refunds and pricing. Everything you do here
              is audited under your name.
            </p>
          </div>
        </div>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
