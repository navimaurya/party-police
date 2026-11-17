import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { EventCard } from "@/components/events/event-card";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionSkeleton } from "@/components/shared/section";
import { EMPTY_STATES } from "@/lib/humor";
import { serialize } from "@/lib/utils-server";
import { EventListQuerySchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { listEvents } from "@/services/event.service";
import { SortSelect } from "@/components/shared/sort-header";
import { parseSort } from "@/lib/sort";
import { EVENT_DEFAULT_SORT, EVENT_SORT_FIELDS } from "@/lib/sort-fields";

const PUBLIC_SORT_OPTIONS = [
  { value: "eventDate", label: "Party date (earliest first)" },
  { value: "-eventDate", label: "Party date (latest first)" },
  { value: "title", label: "Title (A–Z)" },
  { value: "organizerName", label: "Host (A–Z)" },
  { value: "-createdAt", label: "Recently added" },
];
import { CATEGORY_EMOJI, CATEGORY_LABELS, EVENT_CATEGORIES } from "@/types";

export const metadata: Metadata = { title: "Parties" };

export default function PartiesPage(props: PageProps<"/parties">) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">🎉 All Parties</h1>
        <p className="text-muted-foreground">Every treat, past and future. The Party Committee remembers everything.</p>
      </div>
      <Suspense fallback={<SectionSkeleton rows={6} />}>
        <PartiesList searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("rounded-full border px-3 py-1 text-sm transition", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
      {children}
    </Link>
  );
}

async function PartiesList({ searchParams }: { searchParams: PageProps<"/parties">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const parsed = EventListQuerySchema.safeParse({ ...sp, limit: 12 });
  const q = parsed.success ? parsed.data : EventListQuerySchema.parse({ limit: 12 });
  const sort = parseSort(q.sort, EVENT_SORT_FIELDS, EVENT_DEFAULT_SORT);
  const { items, total } = await listEvents({ ...q, sort: sort.value }, { admin: false });
  const events = serialize(items);
  const pages = Math.max(1, Math.ceil(total / q.limit));

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { status: q.status, category: q.category, sort: sort.value === EVENT_DEFAULT_SORT ? undefined : sort.value, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return `/parties${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Pill href={href({ status: undefined, page: undefined })} active={!q.status}>All</Pill>
            <Pill href={href({ status: "upcoming", page: undefined })} active={q.status === "upcoming"}>Upcoming</Pill>
            <Pill href={href({ status: "completed", page: undefined })} active={q.status === "completed"}>Completed</Pill>
            <Pill href={href({ status: "cancelled", page: undefined })} active={q.status === "cancelled"}>Cancelled</Pill>
          </div>
          <SortSelect options={PUBLIC_SORT_OPTIONS} current={sort.value} defaultSort={EVENT_DEFAULT_SORT} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill href={href({ category: undefined, page: undefined })} active={!q.category}>Every category</Pill>
          {EVENT_CATEGORIES.map((c) => (
            <Pill key={c} href={href({ category: c, page: undefined })} active={q.category === c}>
              {CATEGORY_EMOJI[c]} {CATEGORY_LABELS[c]}
            </Pill>
          ))}
        </div>
      </div>

      {events.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => <EventCard key={e._id} event={e} href={`/parties/${e._id}`} />)}
        </div>
      ) : (
        <EmptyState emoji="🦗" message={EMPTY_STATES.parties} />
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="Pagination">
          {q.page > 1 && <Pill href={href({ page: String(q.page - 1) })} active={false}>← Prev</Pill>}
          <span className="text-sm text-muted-foreground">Page {q.page} of {pages}</span>
          {q.page < pages && <Pill href={href({ page: String(q.page + 1) })} active={false}>Next →</Pill>}
        </nav>
      )}
    </div>
  );
}
