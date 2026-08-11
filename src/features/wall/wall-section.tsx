import { CollaborativeCanvas } from "@/features/wall/collaborative-canvas";
import { getRecentJoins, getWallTiles } from "@/features/wall/data";
import { WallExperience } from "@/features/wall/wall-experience";
import { FOUNDING_COHORT_SIZE } from "@/features/waitlist/roster";
import { SectionHeading } from "@/shared/section-heading";

/** The public, living collection of work on ArtWall. */
export async function WallSection() {
  const [tiles, events] = await Promise.all([getWallTiles(), getRecentJoins()]);

  return (
    <section className="bg-[#faf9f5]">
      <div className="mx-auto max-w-[1240px] px-5 pt-32 pb-20 sm:px-8 sm:pt-40 sm:pb-28 lg:px-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-label tracking-[0.24em] text-[#6d7480] uppercase">
            <span className="mr-3 text-[#db861b]">01</span>The Wall
          </p>
          <h1 className="font-heading mt-7 text-5xl leading-[0.98] tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
            Every artist deserves a place to be seen.
          </h1>
          <p className="text-muted-foreground mt-6 text-lg leading-8 sm:text-xl">
            A living collection of India&apos;s artists and artisans. What
            begins as our wall becomes theirs, one work at a time.
          </p>
        </div>

        <div className="mt-14">
          <WallExperience
            tiles={tiles}
            events={events}
            cohortSize={FOUNDING_COHORT_SIZE}
          />
        </div>

        <div className="mt-28 border-t border-[#e2ded7] pt-16 sm:mt-36">
          <SectionHeading
            eyebrow="One stroke each"
            title="A painting nobody signs alone."
            description="Leave one small mark alongside the people helping shape a fairer, more visible future for Indian art."
          />
          <div className="mt-10 max-w-3xl">
            <CollaborativeCanvas />
          </div>
        </div>
      </div>
    </section>
  );
}
