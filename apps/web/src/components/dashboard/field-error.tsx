import type { FieldErrors } from "@/lib/form-result";

/**
 * Studio-form field wiring for server-returned zod errors (FE-2.01): spread
 * `fieldProps(errors, "title")` on the input (sets name, aria-invalid,
 * aria-describedby) and render `<FieldError errors={errors} name="title" />`
 * below it.
 */
export function fieldProps(errors: FieldErrors | undefined, name: string) {
  const invalid = Boolean(errors?.[name]?.length);
  return {
    name,
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? `${name}-error` : undefined,
  };
}

export function FieldError({
  errors,
  name,
}: {
  errors: FieldErrors | undefined;
  name: string;
}) {
  const message = errors?.[name]?.[0];
  if (!message) return null;
  return (
    <span id={`${name}-error`} className="text-destructive text-xs font-normal">
      {message}
    </span>
  );
}
