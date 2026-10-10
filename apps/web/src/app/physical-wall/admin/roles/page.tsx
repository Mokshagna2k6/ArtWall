import type { Metadata } from "next";

import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";
import { listAdminRoleAssignments } from "@/features/physical-wall/actions/admin-roles";
import { AdminRolesConsole } from "@/features/physical-wall/components/admin-roles-console";

export const metadata: Metadata = {
  title: "Admin roles",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * FE-3.17: the super_admin-only console for the 8-role model
 * (SEC-3.02/3.03) — lists live `admin_role_assignments` and grants/revokes
 * via `grantAdminRole`/`revokeAdminRole`, which already reject a non-
 * super_admin caller and self-grant/self-revoke. Gated here too, page-level,
 * so a non-super_admin never sees the form at all (not just a cosmetic nav
 * hide — `requireAnyAdminRolePage` redirects them before any data loads).
 */
export default async function AdminRolesPage() {
  await requireAnyAdminRolePage(["super_admin"], "/physical-wall/admin/roles");
  const assignments = await listAdminRoleAssignments();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Admin roles</h1>
        <p className="text-ink-muted mt-2 text-sm">
          Grant or revoke one of the 8 named admin roles. Every change is
          written to the audit log under your name.
        </p>
      </div>
      <AdminRolesConsole assignments={assignments} />
    </div>
  );
}
