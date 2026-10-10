import { Eyebrow } from "@/shared/editorial";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  /** Small tracked label above the title - the gallery-placard cue. */
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
  align?: "left" | "center";
  /** Two-digit chapter number, printed before the eyebrow like a catalogue. */
  index?: string;
  /**
   * Render the title as the page's `h1`.
   *
   * Two pages used this component as their topmost heading, which left them
   * with no `h1` at all - a hierarchy bug and an accessibility one. They now
   * pass `as="h1"` instead of growing a second heading system.
   */
  as?: "h1" | "h2";
}

/**
 * The consistent opening of every section.
 *
 * Exists so section headers cannot drift apart in size, rhythm, or wording
 * style as the page grows - the eyebrow/title/description shape is the site's
 * equivalent of a museum wall label, and it should feel identical everywhere.
 *
 * It previously sized its title from a separate token pair (`text-h2
 * lg:text-h1`) that no other page used, so it rendered up to 95% larger than
 * a hand-written `h2` and, above 1024px, exactly as large as a page `h1`.
 * Both now come from the same two roles: `text-display` and `text-section`.
 *
 * Server Component: pure presentation, no JavaScript shipped.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
  align = "left",
  index,
  as: Title = "h2",
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5",
        align === "center" && "items-center text-center",
        className
      )}
    >
      <Eyebrow index={index} align={align}>
        {eyebrow}
      </Eyebrow>
      <Title
        className={cn(
          "font-heading max-w-3xl text-balance",
          Title === "h1" ? "text-display" : "text-section"
        )}
      >
        {title}
      </Title>
      {description && (
        <p className="text-muted-foreground text-lead max-w-2xl text-balance">
          {description}
        </p>
      )}
    </div>
  );
}
