import Link from "next/link";
import {
  BadgeCheck,
  CalendarDays,
  ClipboardCheck,
  FileText,
  IdCard,
  ImageIcon,
  IndianRupee,
  LayoutGrid,
  MessageSquareWarning,
  Network,
  ScrollText,
  ShieldCheck,
  SquareX,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import {
  listOwnAdminRoles,
  requireRolePage,
  type AdminRoleName,
} from "@/features/physical-wall/authorize";

/**
 * FE-3.17: which of the 8 named admin roles may see each section's nav link.
 *
 * `undefined` means the section stays on the broad `requireRole("admin")`
 * catch-all (docs/policy-engine.md's documented scope decision) — any admin
 * sees it, same as today. A section listed here has a real, server-enforced
 * role requirement behind it (its page and/or its write actions call
 * `requireAdminRole`/`requireAnyAdminRolePage`), so hiding its link for a
 * role-less admin is not cosmetic: the route itself redirects them away too.
 * `super_admin` always sees everything — handled once in `visibleItems`
 * below rather than listed on every row.
 */
const ITEMS: {
  href: string;
  label: string;
  icon: typeof TrendingUp;
  roles?: readonly AdminRoleName[];
}[] = [
  { href: "/physical-wall/admin", label: "Overview", icon: TrendingUp },
  { href: "/physical-wall/admin/grid", label: "Wall map", icon: LayoutGrid },
  {
    href: "/physical-wall/admin/wallos",
    label: "WallOS hierarchy",
    icon: Network,
    roles: ["venue_admin"],
  },
  { href: "/physical-wall/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/physical-wall/admin/bookings", label: "Bookings", icon: FileText },
  { href: "/physical-wall/admin/queue", label: "Queue", icon: Users },
  { href: "/physical-wall/admin/catalogs", label: "Pricing", icon: Wallet },
  { href: "/physical-wall/admin/ledger", label: "Ledger", icon: ClipboardCheck },
  { href: "/physical-wall/admin/revenue", label: "Revenue", icon: IndianRupee },
  { href: "/physical-wall/admin/moderation", label: "Moderation", icon: ImageIcon },
  { href: "/physical-wall/admin/grievances", label: "Grievances", icon: MessageSquareWarning },
  {
    href: "/physical-wall/admin/identity",
    label: "Identity",
    icon: IdCard,
    roles: ["compliance_admin"],
  },
  {
    href: "/physical-wall/admin/curators",
    label: "Curators",
    icon: BadgeCheck,
    roles: ["curator_admin"],
  },
  { href: "/physical-wall/admin/audit", label: "Audit log", icon: ScrollText },
  {
    href: "/physical-wall/admin/roles",
    label: "Admin roles",
    icon: ShieldCheck,
    roles: ["super_admin"],
  },
  // The virtual wall's tile takedown console lives outside /physical-wall.
  { href: "/admin", label: "Virtual wall tiles", icon: SquareX },
] as const;

/**
 * The admin console.
 *
 * A left rail rather than tabs, following the prototype. Five destinations that
 * a founder moves between constantly is one too many for a tab strip, and a
 * rail keeps the current section visible while a wide table or the wall map
 * uses the full width beside it. It collapses to a horizontal scroller on a
 * phone, where a fixed 13rem column would eat a third of the screen.

 * SEC-3.02: admin promotion is no longer a live, request-time path (the old
 * ADMIN_EMAILS allowlist bootstrap inside `getActor` was removed) — the
 * first admin is seeded out-of-band (scripts/seed-accounts.mjs) and every
 * admin after that is granted by an existing super_admin via
 * `grantAdminRole`, so a user is already an `admin` (and already holds any
 * specific admin_roles role an action further requires) by the time they
 * reach this layout.
 *
 * FE-3.17: the nav itself is filtered by the actor's live named admin
 * roles — a `curator_admin` with no other role sees "Curators" but not
 * "Identity" or "Admin roles". This is a display convenience, not the real
 * guard: the gated pages (identity, curators, wallos, roles) each call
 * `requireAnyAdminRolePage`/`requireAdminRole` themselves, so a hidden link
 * is also an unreachable route, not just a cosmetic hide. `super_admin`
 * always sees every item.
 */
export default async function PhysicalWallAdminLayout({
  children,
}: LayoutProps<"/physical-wall/admin">) {
  const actor = await requireRolePage("admin", "/physical-wall/admin");
  const heldRoles = await listOwnAdminRoles(actor);
  const isSuperAdmin = heldRoles.includes("super_admin");
  const visibleItems = ITEMS.filter(
    (item) =>
      !item.roles || isSuperAdmin || item.roles.some((role) => heldRoles.includes(role))
  );

  return (
    <div className="mx-auto max-w-7xl px-5 pt-24 pb-24 sm:px-8 sm:pt-28">
      <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-label text-ink-muted tracking-wider uppercase">
            Wall management
          </p>

          <nav aria-label="Wall management" className="mt-4">
            <ul className="-mx-1 flex gap-1 overflow-x-auto pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0">
              {visibleItems.map((item) => (
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
