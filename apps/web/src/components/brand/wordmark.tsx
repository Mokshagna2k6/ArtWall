import { ArtWallLogo } from "@/components/brand/artwall-logo";
import { cn } from "@/lib/utils";

interface WordmarkProps {
  className?: string;
  /** Tailwind size utility for the mark, e.g. "size-7". */
  markClassName?: string;
}

/**
 * Mark plus name, locked together.
 *
 * The name is set in wide-tracked uppercase sans to match the brand asset -
 * deliberately *not* in the editorial serif used for headlines, so the identity
 * stays constant while page typography changes around it.
 */
export function Wordmark({ className, markClassName }: WordmarkProps) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <ArtWallLogo className={cn("size-7", markClassName)} />
      <span className="text-body leading-none font-medium tracking-[0.22em] uppercase">
        ArtWall
      </span>
    </span>
  );
}
