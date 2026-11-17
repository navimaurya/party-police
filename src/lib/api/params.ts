import type { z } from "zod";

export function searchParamsObject(req: Request) {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}

export function parseQuery<T extends z.ZodType>(req: Request, schema: T): z.infer<T> {
  return schema.parse(searchParamsObject(req));
}

export function pageMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export type IdContext = { params: Promise<{ id: string }> };
