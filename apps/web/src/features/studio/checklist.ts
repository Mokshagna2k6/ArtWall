/**
 * The Overview's "Getting started" checklist (§8.2).
 *
 * Every step is derived from state that already exists in the database — there
 * is no progress table and no hardcoded percentage. A dashboard that overstates
 * progress is worse than none, so a step is complete only when the thing it
 * names is genuinely true.
 *
 * Pure on purpose: the page fetches, this decides. Unit-tested in
 * __tests__/checklist.test.ts.
 */

export interface ChecklistInput {
  profile: {
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    location: string | null;
    published: boolean;
  };
  artworks: {
    status: string;
    isPublic: boolean;
    pricePaise: number | null;
  }[];
  certificateCount: number;
  /** art_tags rows bound to one of this artist's works. */
  linkedTagCount: number;
  collectionCount: number;
}

export interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

export interface Checklist {
  steps: ChecklistStep[];
  completed: number;
  total: number;
  /** Whole percent, floored. 0 when nothing is done. */
  percent: number;
}

/** A work anyone can actually buy: public, available, and priced. */
export function isListedForSale(artwork: {
  status: string;
  isPublic: boolean;
  pricePaise: number | null;
}): boolean {
  return (
    artwork.isPublic && artwork.status === "available" && artwork.pricePaise != null
  );
}

export function buildChecklist(input: ChecklistInput): Checklist {
  const { profile, artworks } = input;

  const steps: ChecklistStep[] = [
    {
      id: "profile",
      label: "Complete your profile",
      description: "Name, bio, location and a portrait.",
      href: "/studio/settings",
      done:
        profile.displayName.trim().length > 0 &&
        (profile.bio?.trim().length ?? 0) > 0 &&
        Boolean(profile.avatarUrl) &&
        (profile.location?.trim().length ?? 0) > 0,
    },
    {
      id: "artwork",
      label: "Add your first artwork",
      description: "Image, materials, dimensions and story.",
      href: "/studio/artworks/new",
      done: artworks.length > 0,
    },
    {
      id: "certificate",
      label: "Issue your first certificate",
      description: "A certificate of authenticity for a work.",
      href: "/studio/certificates",
      done: input.certificateCount > 0,
    },
    {
      id: "tag",
      label: "Link a QR or NFC tag",
      description: "Connect a physical tag to a work.",
      href: "/studio/tags",
      done: input.linkedTagCount > 0,
    },
    {
      id: "listed",
      label: "List a work for sale",
      description: "Public, available, and priced.",
      href: "/studio/artworks",
      done: artworks.some(isListedForSale),
    },
    {
      id: "collection",
      label: "Create a collection",
      description: "Group works into a series or selection.",
      href: "/studio/collections",
      done: input.collectionCount > 0,
    },
    {
      id: "publish",
      label: "Publish your public profile",
      description: "Make your practice visible on ArtWall.",
      href: "/studio/settings",
      done: profile.published,
    },
  ];

  const completed = steps.filter((step) => step.done).length;
  return {
    steps,
    completed,
    total: steps.length,
    percent: Math.floor((completed / steps.length) * 100),
  };
}
