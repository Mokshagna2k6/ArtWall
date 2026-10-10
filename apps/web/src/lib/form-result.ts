import { z } from "zod";

/**
 * What a studio server action returns to its form (FE-2.01).
 *
 * Returned rather than thrown: in production Next.js replaces a thrown
 * server action error's message with a generic digest (see
 * node_modules/next/dist/docs/01-app/02-guides/server-actions.md, "Handling
 * expected errors" — model expected errors as return values, not throws), so
 * a thrown zod error would reach the user as "An error occurred". A returned
 * value survives intact and can carry per-field messages.
 */
export type FieldErrors = Record<string, string[] | undefined>;

export type FormFailure = {
  ok: false;
  message: string;
  fieldErrors?: FieldErrors;
};

export type FormResult<T extends object = object> = ({ ok: true } & T) | FormFailure;

export function formInvalid(error: z.ZodError): FormFailure {
  return {
    ok: false,
    message: error.issues[0]?.message ?? "Check the form and try again.",
    fieldErrors: z.flattenError(error).fieldErrors as FieldErrors,
  };
}

export function formFail(message: string, field?: string): FormFailure {
  return {
    ok: false,
    message,
    fieldErrors: field ? { [field]: [message] } : undefined,
  };
}
