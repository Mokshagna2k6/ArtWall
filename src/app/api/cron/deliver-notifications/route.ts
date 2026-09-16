import { NextResponse } from "next/server";

import { deliverPendingNotifications } from "@/features/physical-wall/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await deliverPendingNotifications(50);
  return NextResponse.json(result);
}
