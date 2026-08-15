import type { Metadata } from "next";

import { AdminBookings } from "@/features/physical-wall/components/admin-bookings";
import { listAllBookings } from "@/features/physical-wall/data/bookings";
import { isRazorpayConfigured } from "@/features/physical-wall/razorpay";

export const metadata: Metadata = {
  title: "Bookings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage() {
  const bookings = await listAllBookings();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-display">Bookings</h1>
        <p className="text-ink-muted mt-3 max-w-2xl text-sm leading-6">
          Every booking on the wall. Force actions are audited with your name,
          the reason you give, and the state before and after.
        </p>
      </div>

      <AdminBookings
        bookings={bookings}
        paymentsEnabled={isRazorpayConfigured()}
      />
    </div>
  );
}
