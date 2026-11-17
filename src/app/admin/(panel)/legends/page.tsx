import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireAdminPage } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { EMPTY_STATES } from "@/lib/humor";
import { serialize } from "@/lib/utils-server";
import { getPartyLegends } from "@/services/commitment.service";

export const metadata: Metadata = { title: "Party Legends" };

export default async function LegendsPage() {
  await requireAdminPage();
  const { leaderboard, recent } = serialize(await getPartyLegends({ limit: 100 }));
  return (
    <div>
      <PageHeader title="🌟 Party Legends" subtitle="Hosts who paid their dues. Completed commitments land here automatically." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>🏆 Top hosts (completed public parties)</CardTitle></CardHeader>
          <CardContent>
            {leaderboard.length ? (
              <ol className="space-y-2">
                {leaderboard.map((l, i) => (
                  <li key={l._id} className="flex items-center justify-between gap-2 text-sm">
                    <span><span className="mr-2">{["🥇", "🥈", "🥉"][i] ?? "🎖️"}</span><strong>{l._id}</strong></span>
                    <span className="text-muted-foreground">{l.parties} parties · {formatMoney(l.totalBudget)} · last {formatDate(l.lastParty)}</span>
                  </li>
                ))}
              </ol>
            ) : <EmptyState emoji="🏆" message={EMPTY_STATES.legends} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>✅ Cleared party debts</CardTitle></CardHeader>
          <CardContent>
            {recent.length ? (
              <ul className="space-y-2 text-sm">
                {recent.map((c) => (
                  <li key={c._id} className="rounded-lg border p-2">
                    <strong>{c.personName}</strong> — {c.reason}
                    <span className="block text-xs text-muted-foreground">Cleared {formatDate(c.completedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState emoji="🦗" message="No cleared debts yet." />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
