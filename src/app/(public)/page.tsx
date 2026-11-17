import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, MapPin, User } from "lucide-react";
import { LinkButton } from "@/components/shared/link-button";
import { Card, CardContent } from "@/components/ui/card";
import { PartyCalendar } from "@/components/calendar/party-calendar";
import { Countdown } from "@/components/shared/countdown";
import { DiscountCard } from "@/components/shared/discount-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Section, SectionSkeleton } from "@/components/shared/section";
import { ShameCard } from "@/components/shared/shame-card";
import { CategoryBadge } from "@/components/shared/badges";
import { EventCard } from "@/components/events/event-card";
import { formatDateTime, formatDate } from "@/lib/format";
import { EMPTY_STATES, randomQuote } from "@/lib/humor";
import { serialize } from "@/lib/utils-server";
import { getHomepageEvents } from "@/services/event.service";
import { getHallOfShame, getPartyLegends } from "@/services/commitment.service";
import { listActiveDiscounts } from "@/services/discount.service";

export default function HomePage() {
  return (
    <div className="space-y-14">
      <section className="bg-party relative overflow-hidden rounded-3xl border bg-gradient-to-br from-pink-50 via-white to-amber-50 px-6 py-10 sm:px-10 sm:py-14">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary ring-1 ring-pink-200">
          🚨 Official Party Department
        </p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Life is short. Salaries are temporary. <span className="text-primary">Parties are mandatory!</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Got a new job? Promotion? Birthday? Salary hike? Congratulations — you owe everyone a party. Nobody escapes the Party Committee! 🎉
        </p>
        <Suspense fallback={<p className="mt-4 h-6" />}>
          <RandomQuote />
        </Suspense>
        <div className="mt-6 flex flex-wrap gap-2">
          <LinkButton href="/parties" size="lg">See all parties <ArrowRight /></LinkButton>
          <LinkButton href="/hall-of-shame" size="lg" variant="outline">Visit the Hall of Shame 🏆</LinkButton>
        </div>
      </section>

      <Suspense fallback={<div className="h-48 animate-pulse rounded-3xl bg-muted" />}>
        <HomeEvents />
      </Suspense>

      <Section title="📅 Party Calendar" subtitle="Plan your diet around these dates.">
        <PartyCalendar compact />
      </Section>

      <Suspense fallback={<SectionSkeleton />}>
        <ShameAndLegends />
      </Suspense>

      <Suspense fallback={null}>
        <ActiveDeals />
      </Suspense>
    </div>
  );
}

async function RandomQuote() {
  await connection();
  return <p className="mt-4 text-base font-medium italic text-secondary-foreground">“{randomQuote()}”</p>;
}

async function HomeEvents() {
  await connection();
  const { nextUp, upcoming, instant, completed } = serialize(await getHomepageEvents());
  const rest = upcoming.filter((e) => e._id !== nextUp?._id);
  return (
    <div className="space-y-14">
      {instant.length > 0 && (
        <Section title="🚨 Breaking News" subtitle="Someone has finally decided to give a party! Grab your plates!">
          <div className="grid gap-3 md:grid-cols-2">
            {instant.map((e) => (
              <Link key={e._id} href={`/parties/${e._id}`}>
                <Card className="border-red-200 bg-gradient-to-r from-red-50 to-orange-50 transition hover:shadow-md">
                  <CardContent className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-red-600 animate-pulse">🔴 Live now</p>
                    <h3 className="text-lg font-semibold">{e.title}</h3>
                    <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="size-4" /> {e.organizerName}</span>
                      {e.location && <span className="flex items-center gap-1"><MapPin className="size-4" /> {e.location}</span>}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section title="⏳ Next Party" subtitle="Clear your schedule. Loosen your belt.">
        {nextUp ? (
          <Card className="overflow-hidden border-pink-200 bg-gradient-to-br from-pink-100/60 to-violet-100/60">
            <CardContent className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <CategoryBadge category={nextUp.category} />
                <h3 className="text-2xl font-bold">{nextUp.title}</h3>
                <p className="text-muted-foreground">
                  Hosted by <strong className="text-foreground">{nextUp.organizerName}</strong> · {formatDateTime(nextUp.eventDate)}
                  {nextUp.location ? ` · 📍 ${nextUp.location}` : ""}
                </p>
                <LinkButton href={`/parties/${nextUp._id}`} variant="outline" size="sm">Party details</LinkButton>
              </div>
              <Countdown to={nextUp.eventDate} />
            </CardContent>
          </Card>
        ) : (
          <EmptyState emoji="🍽️" message={EMPTY_STATES.upcoming} />
        )}
      </Section>

      {rest.length > 0 && (
        <Section title="🎈 Upcoming Parties" action={<Link href="/parties?status=upcoming" className="text-sm font-medium text-primary hover:underline">View all →</Link>}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((e) => <EventCard key={e._id} event={e} href={`/parties/${e._id}`} />)}
          </div>
        </Section>
      )}

      <Section title="✅ Recently Completed" subtitle="Parties that actually happened. Respect." action={<Link href="/parties?status=completed" className="text-sm font-medium text-primary hover:underline">History →</Link>}>
        {completed.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {completed.map((e) => <EventCard key={e._id} event={e} href={`/parties/${e._id}`} />)}
          </div>
        ) : (
          <EmptyState emoji="🦗" message={EMPTY_STATES.parties} />
        )}
      </Section>
    </div>
  );
}

async function ShameAndLegends() {
  await connection();
  const [shame, legends] = await Promise.all([getHallOfShame({ limit: 50 }), getPartyLegends({ limit: 5 })]);
  const top = serialize(shame.slice(0, 5));
  const lb = serialize(legends);
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <Section title="🏆 The Hall of Shame" subtitle="Sorted by days overdue. Friendly teasing only. Mostly." action={<Link href="/hall-of-shame" className="text-sm font-medium text-primary hover:underline">Full list →</Link>}>
        {top.length ? <div className="space-y-3">{top.map((c, i) => <ShameCard key={c._id} c={c} rank={i + 1} />)}</div> : <EmptyState emoji="😇" message={EMPTY_STATES.shame} />}
      </Section>
      <Section title="🌟 Party Legends" subtitle="They paid their debts. Heroes walk among us.">
        {lb.leaderboard.length || lb.recent.length ? (
          <Card>
            <CardContent className="space-y-4">
              {lb.leaderboard.length > 0 && (
                <ol className="space-y-2">
                  {lb.leaderboard.slice(0, 5).map((l, i) => (
                    <li key={l._id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2"><span className="w-6 text-lg">{["🥇", "🥈", "🥉"][i] ?? "🎖️"}</span> <strong>{l._id}</strong></span>
                      <span className="text-muted-foreground">{l.parties} part{l.parties === 1 ? "y" : "ies"} hosted</span>
                    </li>
                  ))}
                </ol>
              )}
              {lb.recent.length > 0 && (
                <div className="border-t pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Debts recently cleared</p>
                  <ul className="space-y-1 text-sm">
                    {lb.recent.map((c) => <li key={c._id}>✅ <strong>{c.personName}</strong> — {c.reason} <span className="text-muted-foreground">({formatDate(c.completedAt)})</span></li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <EmptyState emoji="🏆" message={EMPTY_STATES.legends} />
        )}
      </Section>
    </div>
  );
}

async function ActiveDeals() {
  await connection();
  const deals = serialize(await listActiveDiscounts());
  // The whole section is hidden when there are no active applicable discounts.
  if (!deals.length) return null;
  return (
    <Section title="🍕 Party Deals" subtitle="Admin-approved ways to party for less." action={<Link href="/discounts" className="text-sm font-medium text-primary hover:underline">All deals →</Link>}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {deals.slice(0, 3).map((d) => <DiscountCard key={d._id} d={d} />)}
      </div>
    </Section>
  );
}
