"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { nextSort, type SortDir } from "@/lib/sort";
import { cn } from "@/lib/utils";

function useSortHref() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (sort: string, defaultSort: string) => {
    const next = new URLSearchParams(params.toString());
    if (sort === defaultSort) next.delete("sort");
    else next.set("sort", sort);
    next.delete("page"); // a new order starts on page 1
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
}

type HeaderProps = {
  field: string;
  label: string;
  /** The active sort value, e.g. "eventDate" or "-budget". */
  current: string;
  /** The list's default sort (kept out of the URL). */
  defaultSort: string;
  /** Direction on first click (dates/numbers often read best newest/highest first). */
  firstDir?: SortDir;
  className?: string;
};

/** A sortable table column header. Sort state lives in the URL (`?sort=`). */
export function SortHeader(props: HeaderProps) {
  return (
    <Suspense fallback={<TableHead className={props.className}>{props.label}</TableHead>}>
      <SortHeaderInner {...props} />
    </Suspense>
  );
}

function SortHeaderInner({ field, label, current, defaultSort, firstDir = "asc", className }: HeaderProps) {
  const href = useSortHref();
  const active = current === field || current === `-${field}`;
  const dir: SortDir | null = active ? (current.startsWith("-") ? "desc" : "asc") : null;
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <TableHead className={className} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}>
      <Link
        href={href(nextSort(current, field, firstDir), defaultSort)}
        scroll={false}
        className={cn("-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground", active ? "text-foreground" : "text-muted-foreground")}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden />
      </Link>
    </TableHead>
  );
}

export type SortOption = { value: string; label: string };

/** Compact "Sort by" dropdown, for card lists and small screens. */
export function SortSelect(props: { options: SortOption[]; current: string; defaultSort: string; className?: string }) {
  return (
    <Suspense fallback={null}>
      <SortSelectInner {...props} />
    </Suspense>
  );
}

function SortSelectInner({ options, current, defaultSort, className }: { options: SortOption[]; current: string; defaultSort: string; className?: string }) {
  const router = useRouter();
  const href = useSortHref();
  return (
    <label className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <span className="whitespace-nowrap">Sort by</span>
      <select
        className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
        value={current}
        onChange={(e) => router.push(href(e.target.value, defaultSort), { scroll: false })}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
