import type { Metadata } from "next";

import { AdminModeration } from "@/features/physical-wall/components/admin-moderation";
import { requireRolePage } from "@/features/physical-wall/authorize";

export const metadata: Metadata = {
  title: "Moderation",
  robots: { index: false, follow: false },
};

export default async function AdminModerationPage() {
  await requireRolePage("admin", "/physical-wall/admin/moderation");
  return <AdminModeration />;
}
