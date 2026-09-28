import type { Metadata } from "next";

import { AdminModeration } from "@/features/physical-wall/components/admin-moderation";

export const metadata: Metadata = {
  title: "Moderation",
  robots: { index: false, follow: false },
};

export default async function AdminModerationPage() {
  return <AdminModeration />;
}
