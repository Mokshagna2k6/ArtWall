import { ArtworkPreview } from "@/features/preview/artwork-preview";
import { SectionHeading } from "@/shared/section-heading";

export function PreviewSection() {
  return (
    <section
      id="preview"
      className="bg-[#faf9f5] px-5 pt-32 pb-24 sm:px-8 sm:pt-40 lg:px-16"
    >
      <div className="mx-auto max-w-[1180px]">
        <SectionHeading
          eyebrow="See it hung"
          title="See your work where it could live next."
          description="Place your art in a gallery, hotel, café, museum or home. It is fast, private, and designed to make the next step feel real."
        />
        <div className="mt-12">
          <ArtworkPreview />
        </div>
      </div>
    </section>
  );
}
