import {
  StudioNotAvailable,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";

export default function PaymentsPage() {
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Business"
        title="Payments"
        description="Track payment status alongside each sale without processing money in the archive."
      />
      <StudioNotAvailable what="Payment tracking" />
    </div>
  );
}
