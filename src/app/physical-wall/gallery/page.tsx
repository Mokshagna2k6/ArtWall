import type { Metadata } from "next";

import { CommunityGallerySection } from "@/features/physical-wall/components/community-gallery";

export const metadata: Metadata = {
  title: "Community Gallery",
  description: "Photos from visitors at The Wall — Ric Platter, Jaipur.",
};

export const revalidate = 30;

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <CommunityGallerySection />
    </div>
  );
}
