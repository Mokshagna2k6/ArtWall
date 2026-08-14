import { ArtworkPreview } from "@/features/preview/artwork-preview";
import { SectionHeading } from "@/shared/section-heading";

export function PreviewSection() {
  return (
    <section
      id="preview"
      className="px-5 pt-32 pb-16 sm:px-8 sm:pt-40 sm:pb-20 lg:px-16 lg:pt-48 lg:pb-24"
    >
      <div className="max-w-page mx-auto">
        {/* `as="h1"`, this is the top of the page. It previously rendered
            an h2, leaving the route with no h1 at all. */}
        <SectionHeading
          as="h1"
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
