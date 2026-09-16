import {
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";
import { getProvenance } from "@/features/coa/actions";

export default async function ProvenancePage() {
  const items = await getProvenance();
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Archive"
        title="Provenance"
        description="Preserve ownership history, condition notes, and supporting records for each work."
      />
      {items.length === 0 ? (
        <div className="studio-card">
          <StudioEmptyState
            title="No provenance records yet"
            description="Issue a certificate or add a provenance event to start building your artwork's history."
          />
        </div>
      ) : (
        <>
          <p className="text-studio-muted text-sm">
            {items.length} {items.length === 1 ? "event" : "events"}
          </p>
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="studio-card flex items-start gap-4 p-5"
              >
                <div
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    item.txHash
                      ? "bg-green-500"
                      : "bg-studio-muted/40"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="studio-eyebrow">{item.eventType}</p>
                    <span className="text-studio-muted text-xs">
                      {new Date(item.occurredAt).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                  <h3 className="text-studio-ink mt-1 text-sm font-medium">
                    {item.artworkTitle}
                  </h3>
                  {item.label && (
                    <p className="text-studio-muted mt-1 text-sm">
                      {item.label}
                    </p>
                  )}
                  {item.txHash && (
                    <p className="mt-1 font-mono text-xs text-green-600">
                      tx: {item.txHash.slice(0, 10)}…
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
