import Link from "next/link";
import { EventsTable } from "@/components/admin/events-table";
import { PageHeader } from "@/components/admin/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { Input } from "@/components/ui/input";
import { requireManagerPage, requireUserPage } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { serialize } from "@/lib/utils-server";
import { EventListQuerySchema } from "@/lib/validation";
import { listEvents } from "@/services/event.service";
import { SortSelect } from "@/components/shared/sort-header";
import { parseSort } from "@/lib/sort";
import { EVENT_DEFAULT_SORT, EVENT_SORT_FIELDS } from "@/lib/sort-fields";

export const EVENT_SORT_OPTIONS = [
  { value: "eventDate", label: "Party date (earliest first)" },
  { value: "-eventDate", label: "Party date (latest first)" },
  { value: "title", label: "Title (A–Z)" },
  { value: "organizerName", label: "Host (A–Z)" },
  { value: "-budget", label: "Budget (highest first)" },
  { value: "budget", label: "Budget (lowest first)" },
  { value: "status", label: "Status" },
  { value: "-createdAt", label: "Recently added" },
];
import { CATEGORY_EMOJI, CATEGORY_LABELS, isPartyManager, type EventCategory } from "@/types";

type SP = Record<string, string | string[] | undefined>;

export async function PartiesAdminView({ basePath, category, searchParams }: { basePath: string; category?: EventCategory; searchParams: Promise<SP> }) {
  // Category pages are for managers+; "/admin/parties" is for everyone (members see only their own).
  const user = category ? await requireManagerPage() : await requireUserPage();
  const mine = !isPartyManager(user.role);
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = EventListQuerySchema.safeParse({ ...sp, category: category ?? sp.category, limit: 20 });
  const q = parsed.success ? parsed.data : EventListQuerySchema.parse({ category, limit: 20 });
  const sort = parseSort(q.sort, EVENT_SORT_FIELDS, EVENT_DEFAULT_SORT);
  const { items, total } = await listEvents(q, { admin: true, organizerEmail: mine ? user.email : undefined });
  const pages = Math.max(1, Math.ceil(total / q.limit));
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = { status: q.status, eventType: q.eventType, q: q.q, sort: sort.value === EVENT_DEFAULT_SORT ? undefined : sort.value, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return `${basePath}${s ? `?${s}` : ""}`;
  };
  const pill = (active: boolean) => cn("rounded-full border px-3 py-1 text-xs font-medium transition", active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted");

  return (
    <div>
      <PageHeader
        title={category ? `${CATEGORY_EMOJI[category]} ${CATEGORY_LABELS[category]}s` : mine ? "🎉 My Parties" : "🎉 Party Management"}
        subtitle={mine ? `Parties you are giving · ${total} found. Add yours, and ask for approval once it's done.` : `${total} part${total === 1 ? "y" : "ies"} found`}
        action={
          <div className="flex gap-2">
            <LinkButton href={`/admin/parties/new?type=instant${category ? `&category=${category}` : ""}`} variant="outline">🚨 Instant</LinkButton>
            <LinkButton href={`/admin/parties/new${category ? `?category=${category}` : ""}`}>+ New party</LinkButton>
          </div>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {([undefined, "upcoming", "completed", "cancelled"] as const).map((s) => (
            <Link key={s ?? "all"} href={href({ status: s, page: undefined })} className={pill(q.status === s)}>{s ? s[0].toUpperCase() + s.slice(1) : "All"}</Link>
          ))}
          <span className="mx-1 w-px bg-border" />
          {([undefined, "scheduled", "instant"] as const).map((t) => (
            <Link key={t ?? "any"} href={href({ eventType: t, page: undefined })} className={pill(q.eventType === t)}>{t ? (t === "instant" ? "🚨 Instant" : "📅 Scheduled") : "Any type"}</Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={basePath} className="flex gap-2">
            {q.status && <input type="hidden" name="status" value={q.status} />}
            {q.eventType && <input type="hidden" name="eventType" value={q.eventType} />}
            {sort.value !== EVENT_DEFAULT_SORT && <input type="hidden" name="sort" value={sort.value} />}
            <Input name="q" defaultValue={q.q} placeholder="Search title, host, venue…" className="w-56" aria-label="Search parties" />
          </form>
          <SortSelect options={EVENT_SORT_OPTIONS} current={sort.value} defaultSort={EVENT_DEFAULT_SORT} />
        </div>
      </div>
      <EventsTable events={serialize(items)} sort={sort.value} />
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
          {q.page > 1 && <Link className={pill(false)} href={href({ page: String(q.page - 1) })}>← Prev</Link>}
          <span className="text-muted-foreground">Page {q.page} / {pages}</span>
          {q.page < pages && <Link className={pill(false)} href={href({ page: String(q.page + 1) })}>Next →</Link>}
        </nav>
      )}
    </div>
  );
}
