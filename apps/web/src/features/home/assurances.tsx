import { Crosshair, Lock, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Assurance {
  icon: LucideIcon;
  title: string;
  body: string;
}

/**
 * The three promises, written for the person making the work.
 *
 * Deliberately answers the artist's questions rather than the investor's. A
 * page can list six systems and still leave a painter wondering whether they
 * are about to lose control of their own painting; these are the three
 * anxieties that actually stop someone uploading.
 */
const ASSURANCES: readonly Assurance[] = [
  {
    icon: Lock,
    title: "The work stays yours",
    body: "You keep copyright, resale rights and the final say on where a piece appears. ArtWall holds the record, never the ownership.",
  },
  {
    icon: Crosshair,
    title: "Found by the right eyes",
    body: "Placement is matched, not broadcast. Your work goes where the people who care about that tradition already stand.",
  },
  {
    icon: Settings,
    title: "Built with artists",
    body: "Founding members are asked before we build, not surveyed afterwards. The roadmap follows what hurts, in your words.",
  },
];

/**
 * Circular icon markers.
 *
 * A ring rather than a filled chip: on a white gallery wall a solid block of
 * colour reads as a button and asks to be clicked. The outline holds the same
 * space while staying quiet, and the icon is the only place the signal colour
 * appears at this size.
 *
 * The double ring is drawn with `ring` on the outside and the border inside,
 * so the halo costs no extra element and no shadow.
 *
 * Server Component: static markup, no JavaScript.
 */
export function Assurances() {
  return (
    <ul className="grid gap-12 sm:grid-cols-3 sm:gap-8 lg:gap-16">
      {ASSURANCES.map(({ icon: Icon, title, body }) => (
        <li key={title} className="flex flex-col items-start">
          <span
            aria-hidden
            className="border-border ring-band flex size-16 shrink-0 items-center justify-center rounded-full border ring-8"
          >
            <Icon className="text-signal size-6" strokeWidth={1.5} />
          </span>
          <h3 className="font-heading text-card mt-7">{title}</h3>
          <p className="text-muted-foreground mt-3 leading-7">{body}</p>
        </li>
      ))}
    </ul>
  );
}
