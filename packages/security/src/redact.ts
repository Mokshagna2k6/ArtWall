const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const PG_URL = /\b(postgres(?:ql)?:\/\/)[^\s'"]+/gi;
const LONG_HEX = /\b[a-f0-9]{40,}\b/gi;
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|signature|aadhaar|pan|otp|cvv|card/i;

/** Scrub PII/secrets from a string for logging. */
export function redactString(s: string): string {
  return s
    .replace(PG_URL, "$1[REDACTED]")
    .replace(BEARER, "$1 [REDACTED]")
    .replace(EMAIL, "$1***$2")
    .replace(LONG_HEX, "[REDACTED_HEX]");
}

/** Deep-copy `value` with sensitive keys blanked and strings scrubbed. Depth-capped (cycle safe). */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 6) return "[DEPTH]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1),
    ])
  );
}
