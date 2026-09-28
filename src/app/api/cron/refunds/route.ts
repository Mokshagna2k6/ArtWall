import { NextResponse } from "next/server";

import { processOpenRefunds } from "@/features/physical-wall/refunds";
import { isCronAuthorized } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Retry refunds that are pending, failed, or stuck mid-flight (BE-1.14). */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await processOpenRefunds());
}
