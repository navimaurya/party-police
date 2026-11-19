import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Download, FileText, MapPin, User, Users, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge, InstantBadge, StatusBadge } from "@/components/shared/badges";
import { Countdown } from "@/components/shared/countdown";
import { DiscountCard } from "@/components/shared/discount-card";
import { AppError } from "@/lib/errors";
import { formatBytes, formatMoney, formatPartyDate } from "@/lib/format";
import { serialize } from "@/lib/utils-server";
import { getEvent } from "@/services/event.service";
import { listBills } from "@/services/bill.service";
import { listActiveDiscounts } from "@/services/discount.service";

export default function PartyDetailPage(props: PageProps<"/parties/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-muted" />}>
      <PartyDetail params={props.params} />
    </Suspense>
  );
}

function isFuture(date: string) {
  return new Date(date).getTime() > Date.now();
}

async function load(id: string) {
  try {
    return await getEvent(id, { admin: false });
  } catch (err) {
    if (err instanceof AppError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
}

async function PartyDetail({ params }: { params: PageProps<"/parties/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const event = serialize(await load(id));
  const [bills, deals] = await Promise.all([
    listBills({ eventId: id, admin: false }),
    event.status === "upcoming" ? listActiveDiscounts({ category: event.category, venue: event.location || undefined }) : Promise.resolve([]),
  ]);
  const files = serialize(bills.items);
  const discounts = serialize(deals);
  const upcomingFuture = event.status === "upcoming" && isFuture(event.eventDate);

  return (
    <div className="space-y-8">
      <Link href="/parties" className="text-sm text-muted-foreground hover:text-foreground">← All parties</Link>
      <div className={`cat-${event.category} rounded-3xl border border-l-8 border-l-[var(--cat)] bg-card p-6 shadow-sm sm:p-8`}>
        <div className="mb-3 flex flex-wrap gap-2">
          <CategoryBadge category={event.category} />
          {event.eventType === "instant" && <InstantBadge />}
          <StatusBadge status={event.status} />
        </div>
        <h1 className="text-3xl font-bold sm:text-4xl">{event.title}</h1>
        {event.occasion && <p className="mt-1 text-lg text-muted-foreground">{event.occasion}</p>}
        <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <p className="flex items-center gap-2"><User className="size-4 text-primary" /> Hosted by <strong>{event.organizerName}</strong></p>
          <p className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" /> {formatPartyDate(event.eventDate)}</p>
          {event.location && <p className="flex items-center gap-2"><MapPin className="size-4 text-primary" /> {event.location}</p>}
          {event.budget != null && <p className="flex items-center gap-2"><Wallet className="size-4 text-primary" /> Budget: {formatMoney(event.budget, event.currency)}</p>}
        </div>
        {event.description && <p className="mt-6 whitespace-pre-line leading-relaxed">{event.description}</p>}
        {upcomingFuture && (
          <div className="mt-6">
            <Countdown to={event.eventDate} />
          </div>
        )}
        {event.status === "completed" && <p className="mt-6 rounded-xl bg-emerald-50 p-3 text-emerald-800">🎉 This party happened! {event.organizerName} has been promoted to Party Legend.</p>}
        {event.status === "cancelled" && <p className="mt-6 rounded-xl bg-zinc-100 p-3 text-zinc-700">😢 Cancelled. The debt, however, remains on record. 📒</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {event.participants?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4" /> Party people ({event.participants.length})</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {event.participants.map((p, i) => <span key={i} className="rounded-full bg-secondary px-3 py-1 text-sm">{p.name}</span>)}
            </CardContent>
          </Card>
        )}
        {files.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-4" /> Bills & photos</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {files.filter((f) => f.mimeType.startsWith("image/")).map((f) => (
                  <a key={f._id} href={`/api/files/${f._id}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by the secure file route, not next/image */}
                    <img src={`/api/files/${f._id}`} alt={f.description || f.originalFileName} className="aspect-square w-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
              <ul className="space-y-1 text-sm">
                {files.filter((f) => !f.mimeType.startsWith("image/")).map((f) => (
                  <li key={f._id} className="flex items-center justify-between gap-2">
                    <a href={`/api/files/${f._id}`} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-primary hover:underline">{f.originalFileName}</a>
                    <a href={`/api/files/${f._id}?op=download`} className="flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground"><Download className="size-3.5" /> {formatBytes(f.fileSize)}</a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {discounts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">🍕 Deals for this party</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {discounts.map((d) => <DiscountCard key={d._id} d={d} />)}
          </div>
        </section>
      )}
    </div>
  );
}
