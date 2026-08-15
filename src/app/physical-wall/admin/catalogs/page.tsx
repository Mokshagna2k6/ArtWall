import type { Metadata } from "next";

import { CatalogEditor } from "@/features/physical-wall/components/catalog-editor";
import {
  getCurrentRefundPolicy,
  getSettings,
  listAddons,
  listRefundPolicies,
  listSizes,
  listSlotTypes,
} from "@/features/physical-wall/data/catalogs";

export const metadata: Metadata = {
  title: "Pricing",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCatalogsPage() {
  const [sizes, types, addons, policy, policyHistory, settings] =
    await Promise.all([
      listSizes(true),
      listSlotTypes(true),
      listAddons(true),
      getCurrentRefundPolicy(),
      listRefundPolicies(),
      getSettings(),
    ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-display">Pricing</h1>
        <p className="text-ink-muted mt-3 max-w-2xl text-sm leading-6">
          Everything the pricing engine reads. Nothing here re-prices a booking
          that is already confirmed — those keep the figures they were quoted.
        </p>
      </div>

      <CatalogEditor
        sizes={sizes}
        types={types}
        addons={addons}
        policy={policy}
        policyHistory={policyHistory}
        settings={settings}
      />
    </div>
  );
}
