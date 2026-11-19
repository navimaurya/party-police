import Link from "next/link";
import type { Metadata } from "next";
import { AlarmClock, Bell, CalendarCheck, CalendarClock, FileText, PartyPopper, Pizza, Skull, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { CategoryBadge } from "@/components/shared/badges";
import { Countdown } from "@/components/shared/countdown";
import { requireAdminPage } from "@/lib/auth";
import { formatPartyDate } from "@/lib/format";
import { serialize } from "@/lib/utils-server";
import { getDashboardStats } from "@/services/dashboard.service";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const admin = await requireAdminPage();
  const s = serialize(await getDashboardStats());
  const stats = [
    { label: "Total parties", value: s.total, icon: PartyPopper, href: "/admin/parties", tone: "text-pink-600 bg-pink-100" },
    { label: "Upcoming", value: s.upcoming, icon: CalendarClock, href: "/admin/parties?status=upcoming", tone: "text-sky-600 bg-sky-100" },
    { label: "Completed", value: s.completed, icon: CalendarCheck, href: "/admin/parties?status=completed", tone: "text-emerald-600 bg-emerald-100" },
    { label: "Monthly parties", value: s.monthly, icon: Pizza, href: "/admin/monthly", tone: "text-orange-600 bg-orange-100" },
    { label: "Pending commitments", value: s.pendingCommitments, icon: AlarmClock, href: "/admin/defaulters", tone: "text-violet-600 bg-violet-100" },
    { label: "Overdue commitments", value: s.overdueCommitments, icon: Skull, href: "/admin/defaulters", tone: "text-red-600 bg-red-100" },
    { label: "Uploaded bills", value: s.totalBills, icon: FileText, href: "/admin/bills", tone: "text-amber-700 bg-amber-100" },
    { label: "Queued emails", value: s.pendingJobs, icon: Bell, href: "/admin/notifications", tone: "text-indigo-600 bg-indigo-100" },
    { label: "Active users", value: s.activeMembers, icon: Users, href: "/admin/users", tone: "text-fuchsia-600 bg-fuchsia-100" },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${admin.name.split(" ")[0]}`}
        subtitle={`Signed in as ${admin.email}`}
        action={<div className="flex gap-2"><LinkButton href="/admin/parties/new?type=instant" variant="outline">🚨 Instant party</LinkButton><LinkButton href="/admin/parties/new">+ New party</LinkButton></div>}
      />
      {s.failedEmails > 0 && (
        <Link href="/admin/notifications/logs?status=failed" className="block rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 hover:bg-red-100">
          ⚠️ {s.failedEmails} email{s.failedEmails === 1 ? "" : "s"} failed or have uncertain delivery. Review notification logs →
        </Link>
      )}
      {s.awaitingApproval.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="space-y-2">
            <p className="font-heading text-lg font-semibold">⏳ Awaiting your approval ({s.awaitingApproval.length})</p>
            <p className="text-sm text-muted-foreground">These parties have started. Approve each one once its host has actually given it.</p>
            <ul className="divide-y rounded-xl border bg-card">
              {s.awaitingApproval.map((e) => (
                <li key={e._id}>
                  <Link href={`/admin/parties/${e._id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm hover:bg-muted/50">
                    <span><strong>{e.title}</strong> <span className="text-muted-foreground">· {e.organizerName} · {formatPartyDate(e.eventDate)}</span></span>
                    <span className="font-medium text-primary">Review & approve →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {s.activeMembers <= 1 && (
        <Link href="/admin/users" className="block rounded-xl border border-pink-200 bg-pink-50 p-3 text-sm text-pink-900 hover:bg-pink-100">
          👥 You&apos;re the only user so far. Add your team so they get the 9 AM party-day emails →
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, href, tone }) => (
          <Link key={label} href={href}>
            <Card className="transition hover:shadow-md">
              <CardContent className="flex items-center gap-3">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="size-5" /></span>
                <div className="min-w-0">
                  <p className="font-heading text-2xl font-bold tabular-nums">{value}</p>
                  <p className="truncate text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="border-pink-200 bg-gradient-to-br from-pink-50 to-violet-50">
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {s.nextUp ? (
            <>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Next upcoming party</p>
                <h2 className="text-xl font-bold">{s.nextUp.title}</h2>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <CategoryBadge category={s.nextUp.category} /> {s.nextUp.organizerName} · {formatPartyDate(s.nextUp.eventDate)}
                </div>
                <LinkButton href={`/admin/parties/${s.nextUp._id}`} size="sm" variant="outline" className="mt-2">Manage</LinkButton>
              </div>
              <Countdown to={s.nextUp.eventDate} />
            </>
          ) : (
            <p className="text-muted-foreground">No upcoming parties. Time to find someone who just got promoted. 🔍</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
