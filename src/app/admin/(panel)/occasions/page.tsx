import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/admin/user-badges";
import { requireUserPage } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { listUpcomingOccasions, type UpcomingOccasion } from "@/services/occasion.service";
import { isPartyManager } from "@/types";

export const metadata: Metadata = { title: "Occasions" };

const RANGES = [
  { days: 30, label: "Next 30 days" },
  { days: 90, label: "Next 3 months" },
  { days: 366, label: "Next 12 months" },
];

const EMOJI: Record<string, string> = { Birthday: "🎂", Anniversary: "💍", "Work anniversary": "💼", Other: "🎉" };

function when(daysAway: number) {
  if (daysAway === 0) return "Today 🎉";
  if (daysAway === 1) return "Tomorrow";
  return `In ${daysAway} days`;
}

function describe(o: UpcomingOccasion) {
  const what = o.occasion === "Other" ? o.label || "Occasion" : o.occasion;
  if (!o.years) return what;
  if (o.occasion === "Birthday") return `${what} · turns ${o.years}`;
  return `${what} · ${o.years} year${o.years === 1 ? "" : "s"}`;
}

/**
 * Upcoming birthdays, anniversaries, work anniversaries and relatives' events of the team.
 * Each person manages their own family's events from My profile; admins edit them from Users.
 */
export default async function OccasionsPage(props: PageProps<"/admin/occasions">) {
  const user = await requireUserPage();
  const sp = await props.searchParams;
  const days = RANGES.find((r) => String(r.days) === sp.days)?.days ?? 30;
  const items = await listUpcomingOccasions({ days });
  const canSchedule = isPartyManager(user.role);

  return (
    <div className="space-y-6">
      <PageHeader
        title="🎂 Occasions"
        subtitle="Birthdays, anniversaries and family events coming up. Someone's about to owe us a party."
        action={<Link href="/admin/profile" className="text-sm text-primary hover:underline">Add my family&apos;s events →</Link>}
      />
      <div className="flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <Link
            key={r.days}
            href={`/admin/occasions?days=${r.days}`}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", days === r.days ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {r.label}
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState emoji="🗓️" message="No occasions in this period. Add birthdays and anniversaries from the Users page or My profile." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((o) => (
            <Card key={o.key} size="sm" className={cn(o.daysAway === 0 && "ring-2 ring-primary")}>
              <CardContent className="flex items-start gap-3">
                <span className="text-2xl leading-none" aria-hidden>{EMOJI[o.occasion] ?? "🎉"}</span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate font-semibold">{o.personName}</p>
                  <p className="text-sm text-muted-foreground">{describe(o)}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {o.relation !== "Self" && (
                      <>
                        <UserAvatar name={o.userName} email={o.userEmail} size="sm" className="size-5 text-[9px]" />
                        {o.userName}&apos;s {o.relation.toLowerCase()} ·{" "}
                      </>
                    )}
                    {new Date(`${o.nextDay}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", o.daysAway <= 7 ? "bg-pink-100 text-pink-700" : "bg-muted text-muted-foreground")}>{when(o.daysAway)}</span>
                  {canSchedule && (
                    <Link href={`/admin/parties/new?category=special&date=${o.nextDay}`} className="text-xs text-primary hover:underline">Schedule party</Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
