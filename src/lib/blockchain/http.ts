import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "validation_failed"
  | "rate_limited"
  | "payload_too_large"
  | "unsupported_media_type"
  | "conflict"
  | "internal_error";

const STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  rate_limited: 429,
  payload_too_large: 413,
  unsupported_media_type: 415,
  conflict: 409,
  internal_error: 500,
};

export function apiError(
  code: ApiErrorCode,
  opts: { details?: unknown; reqId?: string } = {},
) {
  return NextResponse.json(
    { error: { code, details: opts.details, reqId: opts.reqId } },
    { status: STATUS[code] },
  );
}

export function handleRouteError(
  err: unknown,
  ctx: { route: string; reqId: string },
) {
  if (err instanceof ZodError) {
    return apiError("validation_failed", {
      details: err.flatten(),
      reqId: ctx.reqId,
    });
  }
  console.error(`[${ctx.route}] ${ctx.reqId}`, err instanceof Error ? err.message : err);
  return apiError("internal_error", { reqId: ctx.reqId });
}

export function requestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// In-memory rate limiter (per-instance)
const store = new Map<string, { count: number; resetAt: number }>();

export async function checkRateLimit(
  key: string,
  opts: { limit: number; windowSec: number },
): Promise<{ ok: boolean }> {
  const now = Date.now();
  let bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + opts.windowSec * 1000 };
    store.set(key, bucket);
  }
  bucket.count += 1;
  return { ok: bucket.count <= opts.limit };
}
