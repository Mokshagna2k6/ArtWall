import Link from "next/link";
import {
  BadgeCheck,
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  FileText,
  IdCard,
  ImageIcon,
  IndianRupee,
  LayoutGrid,
  Lock,
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
  BIBLE_ROLES,
  listOwnAdminRoles,
  requireRolePage,
  type AdminRoleName,
} from "@/features/physical-wall/authorize";
import { roleConsolePath } from "@/features/physical-wall/admin-console";
import { countRecentAuditActivity, getRecentAuditActivity } from "@/features/physical-wall/audit";
import { NotificationBell } from "./notification-bell";

const BELL_RECENT_LIMIT = 10;

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

  // FE-3.19: the bell is shell-wide (every admin page), not just the Super
  // Admin console's own activity feed — both read the same
  // getRecentAuditActivity/countRecentAuditActivity helpers in
  // features/physical-wall/audit.ts, so there is exactly one query shape
  // for "recent admin activity," reused by two UI surfaces.
  const [unreadCount, recentActivity] = await Promise.all([
    countRecentAuditActivity(),
    getRecentAuditActivity(BELL_RECENT_LIMIT),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-5 pt-24 pb-24 sm:px-8 sm:pt-28">
      {/* Problem #11: no top bar existed in this shell at all — the nav
          rail was the only chrome. A minimal header row rather than a full
          app-bar component, since the bell is the only thing that needs
          one; the avatar/name box already lives in the rail below. */}
      <div className="mb-6 flex items-center justify-end">
        <NotificationBell count={unreadCount} recent={recentActivity} />
      </div>
      <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        {/* Problem #10: wall-management links + (for a non-super-admin) the
            8-role lock list + the "signed in as" box can together be taller
            than a short viewport, with nothing below `lg:sticky` to let a
            reader scroll down to the items that don't fit. max-h-screen +
            overflow-y-auto lets the rail itself scroll independently of the
            page, same idea as the audit log / moderation queue's own
            overflow-y-auto list panels elsewhere in this feature. */}
        <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
          {/* Problem #4: an explicit, opt-in way back to the public site.
              Not part of the always-present nav below it on purpose — this
              is the one deliberate exit out of the admin-only shell
              (src/app/layout.tsx hides SiteHeader/SiteFooter for every
              /physical-wall/admin route), so it has to be its own link
              rather than relying on a public nav that no longer renders here. */}
          <Link
            href="/physical-wall/admin/view-site"
            className="border-hairline text-ink-muted hover:text-ink hover:border-hairline-strong mb-6 flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
          >
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            View site
          </Link>

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

          {/*
            FE-3.18: the 8-role admin shell (product owner's decision — see
            the task brief). ALWAYS renders all 8 Bible roles, in the Bible's
            order, for every admin — the shell itself never changes; only
            which tiles are unlocked changes per viewer, computed from
            heldRoles/isSuperAdmin above (server-side, not client state).
            An unlocked tile is a real Link; a locked one is plain text
            with a lock icon — genuinely not clickable, not just styled to
            look disabled. That's cosmetic either way: the real guard is
            each role's own page calling requireAnyAdminRolePage with that
            exact role (under admin/console, one folder per role), so
            pasting a locked tile's URL directly still redirects the admin
            away, same as today's curators/identity/wallos/roles pages.

            Problem #9a: a super_admin is never locked out of anything (the
            unlock check below is always true for them), so this list would
            render as 8 identical unlocked links that duplicate the "every
            role, at a glance" list already on their own Super Admin page —
            not useful, just noise. Skipped entirely for super_admin.
          */}
          {!isSuperAdmin && (
            <nav aria-label="Admin roles" className="mt-6">
              <p className="text-label text-ink-muted tracking-wider uppercase">
                Admin roles
              </p>
              <ul className="mt-3 flex flex-col gap-1">
                {BIBLE_ROLES.map((r) => {
                  const unlocked = heldRoles.includes(r.role);
                  return (
                    <li key={r.role}>
                      {unlocked ? (
                        <Link
                          href={roleConsolePath(r.role)}
                          className="text-ink-muted hover:bg-band hover:text-ink flex items-center justify-between gap-2.5 rounded-md px-3 py-2 text-sm transition-colors"
                        >
                          {r.label}
                        </Link>
                      ) : (
                        <span
                          aria-disabled="true"
                          title={`Locked — you don't hold ${r.label}. A super_admin can grant it from the Admin roles console.`}
                          className="text-ink-muted/50 flex cursor-not-allowed items-center justify-between gap-2.5 rounded-md px-3 py-2 text-sm"
                        >
                          {r.label}
                          <Lock className="size-3.5 shrink-0" aria-hidden />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

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
