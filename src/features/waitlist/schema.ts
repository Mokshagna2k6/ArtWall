import { z } from "zod";

/**
 * Practices an artist can identify with. A closed list rather than free text
 * so the founding roster stays groupable (by medium, by region) later without
 * a data-cleaning exercise.
 */
export const practices = [
  "Painting",
  "Sculpture",
  "Photography",
  "Textile",
  "Printmaking",
  "Digital",
  "Folk & traditional",
  "Something else",
] as const;

export const roles = ["artist", "collector"] as const;

/**
 * Only accept image URLs served by Cloudinary.
 *
 * The client uploads directly and reports back the resulting URL, so this field
 * is attacker-controlled. Without a host check, anyone could POST a link to any
 * image on the internet and have the wall render it under our brand - an open
 * hotlinking and defacement hole. Restricting the host closes it.
 */
const cloudinaryUrl = z
  .string()
  .trim()
  .max(2048)
  .pipe(z.url())
  .refine(
    (value) => {
      try {
        const { protocol, hostname } = new URL(value);
        return protocol === "https:" && hostname === "res.cloudinary.com";
      } catch {
        return false;
      }
    },
    { message: "Images must be uploaded through ArtWall." }
  );

/**
 * The single source of truth for waitlist input, shared by the client form and
 * the server action.
 *
 * It is defined once and validated *again* on the server - client validation is
 * a UX affordance, never a security control, since anyone can POST directly to
 * the action endpoint.
 */
export const waitlistSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please tell us your name.")
    .max(80, "That name is longer than we can store."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "That email address is too long.")
    .pipe(z.email("That doesn't look like an email address.")),
  role: z.enum(roles),
  practice: z.enum(practices).optional(),
  city: z
    .string()
    .trim()
    .max(80, "That city name is too long.")
    .optional()
    .or(z.literal("")),
  /**
   * Honeypot. Real people never see this field, so anything in it is a bot.
   * Named innocuously because scrapers skip fields called "honeypot".
   */
  website: z.string().max(0).optional().or(z.literal("")),

  /**
   * Uploaded assets. The browser uploads to Cloudinary directly and posts back
   * the resulting URLs, so these are re-validated here: we only accept URLs on
   * Cloudinary's own host, which stops anyone posting an arbitrary link and
   * having us render it on the wall.
   */
  artworkUrl: cloudinaryUrl.optional().or(z.literal("")),
  artworkPublicId: z.string().max(300).optional().or(z.literal("")),
  artworkWidth: z.coerce.number().int().positive().max(20000).optional(),
  artworkHeight: z.coerce.number().int().positive().max(20000).optional(),
  selfieUrl: cloudinaryUrl.optional().or(z.literal("")),
  selfiePublicId: z.string().max(300).optional().or(z.literal("")),
  artworkTitle: z.string().trim().max(120).optional().or(z.literal("")),
  quote: z.string().trim().max(280).optional().or(z.literal("")),

  /**
   * Founding Member is opt-in, not a consequence of arriving early.
   *
   * Everyone who joins gets a numbered place; claiming founding status is a
   * separate, deliberate yes. An unchecked box posts nothing at all, which is
   * why this is coerced from "absent" rather than validated as a boolean.
   */
  foundingMember: z.boolean().default(false),
});

export type WaitlistInput = z.infer<typeof waitlistSchema>;

export type WaitlistState =
  | { status: "idle" }
  | { status: "success"; founderNumber: number; name: string }
  | {
      status: "error";
      message: string;
      /** Field-level messages, keyed by field name. */
      fieldErrors?: Partial<Record<keyof WaitlistInput, string>>;
    };
