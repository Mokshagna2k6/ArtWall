import {
  StudioNotAvailable,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";

export default function InvoicesPage() {
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Business"
        title="Invoices"
        description="Prepare clear records for sales, commissions, and collector follow-up."
      />
      <StudioNotAvailable what="Studio invoicing" />
    </div>
  );
}
