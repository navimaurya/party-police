"use client";

import { toast } from "sonner";

export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/** Thin fetch wrapper for the admin UI. Same-origin, JSON, consistent error shape. */
export async function api<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(url, {
    credentials: "same-origin",
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const err = body?.error ?? { code: "HTTP_ERROR", message: `Request failed (${res.status})` };
    if (res.status === 401 && typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) {
      // Hard navigation on purpose: the session is gone, so drop all client state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/admin/login";
    }
    throw new ApiClientError(res.status, err.code, err.message, err.details);
  }
  return body.data as T;
}

export function toastError(err: unknown, fallback = "Something went wrong") {
  if (err instanceof ApiClientError) {
    const fieldErrors = (err.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
    const first = fieldErrors ? Object.entries(fieldErrors)[0] : undefined;
    toast.error(first ? `${first[0]}: ${first[1][0]}` : err.message);
  } else {
    toast.error(fallback);
  }
}
