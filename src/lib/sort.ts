/**
 * List sorting shared by server and client.
 * A sort value is a field name, optionally prefixed with "-" for descending: "eventDate", "-budget".
 */
export type SortDir = "asc" | "desc";
export type SortState<F extends string = string> = { field: F; dir: SortDir; value: string };

/** Parses `?sort=` against an allow-list. Unknown values fall back to the default. */
export function parseSort<F extends string>(value: unknown, allowed: readonly F[], fallback: `${"" | "-"}${F}`): SortState<F> {
  const raw = typeof value === "string" && value ? value : fallback;
  const desc = raw.startsWith("-");
  const field = (desc ? raw.slice(1) : raw) as F;
  if (!allowed.includes(field)) return parseSort(fallback, allowed, fallback);
  return { field, dir: desc ? "desc" : "asc", value: raw };
}

/** Clicking a column: same column flips direction; a new column starts in its natural direction. */
export function nextSort(current: string | undefined, field: string, firstDir: SortDir = "asc") {
  const cur = current ?? "";
  if (cur === field) return `-${field}`;
  if (cur === `-${field}`) return field;
  return firstDir === "desc" ? `-${field}` : field;
}

/** Mongo sort object with a stable tiebreaker. */
export function mongoSort(s: SortState, tiebreak: Record<string, 1 | -1> = { _id: 1 }): Record<string, 1 | -1> {
  const sort: Record<string, 1 | -1> = { [s.field]: s.dir === "asc" ? 1 : -1 };
  // The chosen field always wins; tiebreakers only add fields that aren't already sorted on.
  for (const [k, v] of Object.entries(tiebreak)) if (!(k in sort)) sort[k] = v;
  return sort;
}

/** Case-insensitive ordering for text fields. */
export const TEXT_COLLATION = { locale: "en", strength: 2 } as const;
