import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionSkeleton, Section } from "@/components/shared/section";
import { ShameCard } from "@/components/shared/shame-card";
import { EMPTY_STATES } from "@/lib/humor";
import { formatDate, formatMoney } from "@/lib/format";
import { serialize } from "@/lib/utils-server";
import { getHallOfShame, getPartyLegends } from "@/services/commitment.service";

export const metadata: Metadata = { title: "Hall of Shame" };

export default function HallOfShamePage() {
  return (
    <div className="space-y-10">
      <div className="rounded-3xl border bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 p-6 sm:p-10">
        <h1 className="text-4xl font-bold">THE HALL OF SHAME 🏆</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          These brave souls owe us a party. Sorted by days overdue. All teasing is friendly — but the debt is very, very real. 😂
        </p>
      </div>
      <Suspense fallback={<SectionSkeleton />}>
        <Boards />
      </Suspense>
    </div>
  );
}

async function Boards() {
  await connection();
  const [shame, legends] = await Promise.all([getHallOfShame(), getPartyLegends({ limit: 30 })]);
  const list = serialize(shame);
  const lg = serialize(legends);
  return (
    <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
      <Section title="😬 Party Defaulters" subtitle={`${list.length} pending ${list.length === 1 ? "debt" : "debts"}`}>
        {list.length ? <div className="space-y-3">{list.map((c, i) => <ShameCard key={c._id} c={c} rank={i + 1} />)}</div> : <EmptyState emoji="😇" message={EMPTY_STATES.shame} />}
      </Section>
      <Section title="🌟 Party Legends" subtitle="Debt-free and loved by all.">
        {lg.leaderboard.length > 0 && (
          <Card>
            <CardContent>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top hosts</p>
              <ol className="space-y-2">
                {lg.leaderboard.map((l, i) => (
                  <li key={l._id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2"><span className="w-6 text-lg">{["🥇", "🥈", "🥉"][i] ?? "🎖️"}</span><strong>{l._id}</strong></span>
                    <span className="text-right text-muted-foreground">{l.parties} hosted{l.totalBudget ? ` · ${formatMoney(l.totalBudget)}` : ""}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
        {lg.recent.length ? (
          <ul className="space-y-2">
            {lg.recent.map((c) => (
              <li key={c._id} className="rounded-xl border bg-emerald-50/60 p-3 text-sm">
                <p>✅ <strong>{c.personName}</strong> paid up for <em>{c.reason}</em></p>
                <p className="text-xs text-muted-foreground">Cleared on {formatDate(c.completedAt)}</p>
              </li>
            ))}
          </ul>
        ) : (
          !lg.leaderboard.length && <EmptyState emoji="🏆" message={EMPTY_STATES.legends} />
        )}
      </Section>
    </div>
  );
}
