import type { Metadata } from "next";

import { SelfieBooth } from "@/features/physical-wall/components/selfie-booth";

export const metadata: Metadata = {
  title: "Selfie with the Wall",
  description: "Take a photo with the exhibition and share it to the community gallery.",
  robots: { index: false, follow: false },
};

export default async function SelfiePage({
  searchParams,
}: {
  searchParams: Promise<{ visitId?: string }>;
}) {
  const { visitId } = await searchParams;
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <SelfieBooth visitId={visitId} />
    </div>
  );
}
