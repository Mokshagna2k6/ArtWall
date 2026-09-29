import { NextResponse } from "next/server";

import { deadline, isCronAuthorized } from "@/lib/cron";
import { deliverPendingNotifications, queueScheduledNotifications } from "@/features/physical-wall/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const until = deadline(maxDuration);
  const scheduled = await queueScheduledNotifications();
  const result = await deliverPendingNotifications(50, undefined, until);
  return NextResponse.json({ scheduled, ...result });
}
