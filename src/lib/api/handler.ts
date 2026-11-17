import { NextResponse, connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { ZodError, z } from "zod";
import mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import type { PaginationMeta } from "@/types";

export function ok<T>(data: T, init?: { status?: number; meta?: PaginationMeta; headers?: HeadersInit }) {
  return NextResponse.json(
    { success: true, data, ...(init?.meta ? { meta: init.meta } : {}) },
    { status: init?.status ?? 200, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } }
  );
}

export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json(
    { success: false, error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

/** Centralized error -> HTTP response mapping. */
export function toErrorResponse(err: unknown) {
  if (err instanceof AppError) {
    const res = fail(err.status, err.code, err.message, err.details);
    const retry = (err.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
    if (retry) res.headers.set("Retry-After", String(retry));
    return res;
  }
  if (err instanceof ZodError) {
    return fail(400, "VALIDATION_ERROR", "Invalid input", z.flattenError(err));
  }
  if (err instanceof mongoose.Error.CastError) {
    return fail(400, "BAD_REQUEST", `Invalid value for ${err.path}`);
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return fail(400, "VALIDATION_ERROR", err.message);
  }
  if (typeof err === "object" && err && (err as { code?: number }).code === 11000) {
    return fail(409, "DUPLICATE", "A record with the same unique value already exists");
  }
  console.error("[api] unhandled error", err);
  return fail(500, "INTERNAL_ERROR", "Something went wrong. The Party Committee is investigating 🕵️");
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/**
 * Wraps a route handler with centralized error handling.
 * API routes always run at request time (they read cookies / the database),
 * and Next.js-internal control-flow errors are re-thrown untouched.
 */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    await connection();
    try {
      return await handler(req, ctx);
    } catch (err) {
      unstable_rethrow(err);
      return toErrorResponse(err);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(400, "BAD_JSON", "Request body must be valid JSON");
  }
}
