import { z } from "zod";

import { practices } from "@/features/waitlist/schema";

/**
 * What an artist submits to hang a work.
 *
 * The image itself never passes through this schema - the browser has already
 * uploaded it to Cloudinary by the time this runs, so what arrives here is a
 * URL and a public_id that the *client* chose. Both are therefore treated as
 * hostile input and re-checked against our own account in the action.
 */

/** Accepted image types, enforced client-side and again by Cloudinary. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
] as const;

/** 15MB. Comfortably above a modern phone photo, below anything pathological. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const cloudinaryUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value.startsWith("https://res.cloudinary.com/"), {
    message: "That image did not come from our uploader.",
  });

const publicId = z
  .string()
  .trim()
  .min(1)
  .max(300)
  // Cloudinary public_ids are path-like. Anything outside this set is either a
  // traversal attempt or a value we did not generate.
  .regex(/^[\w./-]+$/, "Unexpected image reference.");

export const publishSchema = z.object({
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
  city: z.string().trim().max(80).optional().or(z.literal("")),
  practice: z.enum(practices).optional(),

  artworkTitle: z
    .string()
    .trim()
    .max(120, "Keep the title under 120 characters.")
    .optional()
    .or(z.literal("")),
  quote: z
    .string()
    .trim()
    .max(280, "Keep it under 280 characters.")
    .optional()
    .or(z.literal("")),

  artworkUrl: cloudinaryUrl,
  artworkPublicId: publicId,
  artworkWidth: z.coerce.number().int().positive().max(30000),
  artworkHeight: z.coerce.number().int().positive().max(30000),

  selfieUrl: cloudinaryUrl.optional().or(z.literal("")),
  selfiePublicId: publicId.optional().or(z.literal("")),

  /** Cloudinary's moderation verdict, echoed back by the browser. Advisory
   *  only - the server re-checks with Cloudinary rather than trusting it. */
  artworkModeration: z.string().trim().max(40).optional().or(z.literal("")),

  /** Honeypot - see the waitlist schema for why it is named this way. */
  website: z.string().max(0).optional().or(z.literal("")),
});

export type PublishInput = z.infer<typeof publishSchema>;

export type PublishState =
  | { status: "idle" }
  | { status: "success"; founderNumber: number; name: string; hidden: boolean }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<Record<keyof PublishInput, string>>;
    };
