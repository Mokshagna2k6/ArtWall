import { runCron } from "@/lib/cron";
import { deliverPendingNotifications, queueScheduledNotifications } from "@/features/physical-wall/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  return runCron("deliver-notifications", request, async () => {
    const scheduled = await queueScheduledNotifications();
    const r = await deliverPendingNotifications(50);
    return { processed: r.sent + r.failed + r.dead, errors: r.failed + r.dead, scheduled, ...r };
  });
}
