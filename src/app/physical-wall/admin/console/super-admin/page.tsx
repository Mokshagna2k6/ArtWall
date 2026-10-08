import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { BIBLE_ROLES, requireAnyAdminRolePage } from "@/features/physical-wall/authorize";
import { roleConsolePath } from "@/features/physical-wall/admin-console";

export const metadata: Metadata = {
  title: "Super Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * FE-3.18: Super Admin's own landing tile. There is nothing new to build
 * here — per the product owner, "for super admin everything would be the
 * same according to the Bible," i.e. this role's access doesn't change: it
 * already sees every other role's page unlocked (requireAnyAdminRolePage's
 * super_admin bypass) and already has its own grant/revoke console at
 * /physical-wall/admin/roles. This page is just the front door to both.
 */
export default async function SuperAdminConsolePage() {
  await requireAnyAdminRolePage(["super_admin"], "/physical-wall/admin/console/super-admin");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Super Admin</h1>
        <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
          Full platform control. Every other role&rsquo;s page below is
          already unlocked for you — super_admin bypasses every per-role
          check in this admin area, including ones added after this page
          shipped.
        </p>
      </div>

      <Link
        href="/physical-wall/admin/roles"
        className="border-hairline hover:bg-band flex items-center gap-3 rounded-md border p-5 transition-colors"
      >
        <ShieldCheck className="size-5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-medium">Grant or revoke admin roles</p>
          <p className="text-ink-muted mt-1 text-xs">
            The console you already have for the 9 named roles.
          </p>
        </div>
      </Link>

      <div>
        <p className="text-label text-ink-muted tracking-wider uppercase">
          Every role, at a glance
        </p>
        <ul className="border-hairline mt-3 flex flex-col rounded-md border text-sm">
          {BIBLE_ROLES.map((r, i) => (
            <li
              key={r.role}
              className={i > 0 ? "border-hairline border-t px-4 py-3" : "px-4 py-3"}
            >
              <Link href={roleConsolePath(r.role)} className="underline underline-offset-4">
                {r.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
