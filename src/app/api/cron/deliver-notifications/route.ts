import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/cron";
import { deliverPendingNotifications, queueScheduledNotifications } from "@/features/physical-wall/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scheduled = await queueScheduledNotifications();
  const result = await deliverPendingNotifications(50);
  return NextResponse.json({ scheduled, ...result });
}
