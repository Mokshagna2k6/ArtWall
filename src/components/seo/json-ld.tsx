/**
 * JSON for an inline <script type="application/ld+json">. JSON.stringify does not
 * escape "<", so a user-controlled string containing "</script>" would close the
 * tag and inject markup. \u003c is the same character to a JSON parser.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
