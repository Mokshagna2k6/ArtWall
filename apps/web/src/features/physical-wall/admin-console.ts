import type { AdminRoleName } from "@/features/physical-wall/authorize";

/**
 * FE-3.18: URL slug for each Bible role's landing page under
 * /physical-wall/admin/console/<slug>. One lookup, shared by the nav shell
 * (layout.tsx) and any page that links to another role's console (e.g. the
 * Super Admin page's "every role, at a glance" list), so the two never drift.
 */
const SLUGS: Record<AdminRoleName, string> = {
  super_admin: "super-admin",
  operations_admin: "operations-admin",
  finance_admin: "finance-admin",
  content_admin: "content-admin",
  support_admin: "support-admin",
  analytics_admin: "analytics-admin",
  venue_admin: "wall-network-admin",
  blockchain_admin: "blockchain-admin",
  curator_admin: "curator-admin",
  compliance_admin: "compliance-admin",
};

export function roleConsolePath(role: AdminRoleName): string {
  return `/physical-wall/admin/console/${SLUGS[role]}`;
}
