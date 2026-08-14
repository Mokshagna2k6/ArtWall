import { CollaborativeCanvas } from "@/features/wall/collaborative-canvas";
import { getRecentJoins, getWallTiles } from "@/features/wall/data";
import { MultilingualWelcome } from "@/features/wall/multilingual-welcome";
import { WallExperience } from "@/features/wall/wall-experience";
import { FOUNDING_COHORT_SIZE } from "@/features/waitlist/roster";
import { getSessionUser } from "@/lib/session";
import { Eyebrow } from "@/shared/editorial";
import { SectionHeading } from "@/shared/section-heading";

/** The public, living collection of work on ArtWall. */
export async function WallSection() {
  const [tiles, events, user] = await Promise.all([
    getWallTiles(),
    getRecentJoins(),
    getSessionUser(),
  ]);

  return (
    <section className="bg-background">
      <div className="max-w-page mx-auto px-5 pt-32 pb-16 sm:px-8 sm:pt-40 sm:pb-20 lg:px-16 lg:pt-48 lg:pb-24">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow index="01" align="center">
            The Wall
          </Eyebrow>
          <h1 className="font-heading text-display mt-7 text-balance">
            Every artist deserves a place to be seen.
          </h1>
          <p className="text-muted-foreground text-lead mt-6">
            A living collection of India&apos;s artists and artisans. What
            begins as our wall becomes theirs, one work at a time.
          </p>

          {/* Said in turn in the languages of the people it is addressed to.
              An English-only welcome on a page built for seven million Indian
              artisans undercuts the sentence it is making. */}
          <MultilingualWelcome />
        </div>

        <div className="mt-16">
          <WallExperience
            tiles={tiles}
            events={events}
            cohortSize={FOUNDING_COHORT_SIZE}
            signedIn={Boolean(user)}
          />
        </div>

        <div className="border-border mt-28 border-t pt-16 sm:mt-36">
          <SectionHeading
            index="02"
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
