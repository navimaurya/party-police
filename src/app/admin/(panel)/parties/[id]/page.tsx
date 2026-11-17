import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BillsManager } from "@/components/bills/bills-manager";
import { EventForm } from "@/components/admin/event-form";
import { toFormValue } from "@/components/admin/event-form-value";
import { PageHeader } from "@/components/admin/page-header";
import { StatusActions } from "@/components/admin/status-actions";
import { CategoryBadge, StatusBadge } from "@/components/shared/badges";
import { env } from "@/config/env";
import { requireAdminPage } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { serialize } from "@/lib/utils-server";
import { NOTIFICATION_TYPE_LABELS, type NotificationType } from "@/types";
import { listBills } from "@/services/bill.service";
import { getBudgetConfig } from "@/services/budget.service";
import { getEvent } from "@/services/event.service";
import { listEventJobs } from "@/services/notification.service";
import { listActiveUsers } from "@/services/user.service";
import { ROLE_LABELS } from "@/types";

/** Request-time check (this page renders per request, after `connection()`). */
function hasStarted(date: string) {
  return new Date(date).getTime() <= Date.now();
}

export default async function AdminPartyPage(props: PageProps<"/admin/parties/[id]">) {
  await requireAdminPage();
  const { id } = await props.params;
  let raw;
  try {
    raw = await getEvent(id, { admin: true });
  } catch (err) {
    if (err instanceof AppError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const [bills, budget, jobs, membersRaw] = await Promise.all([
    listBills({ eventId: id, admin: true, limit: 100 }),
    getBudgetConfig(),
    listEventJobs(id),
    listActiveUsers(),
  ]);
  const members = membersRaw.map((m) => ({ name: m.name, email: m.email, role: ROLE_LABELS[m.role] }));
  const event = serialize(raw);
  const pendingThankYou = jobs.find((j) => j.jobType === "thank_you" && j.status === "pending");
  const partyStarted = hasStarted(event.eventDate);

  return (
    <div className="space-y-6">
      <Link href="/admin/parties" className="text-sm text-muted-foreground hover:text-foreground">← All parties</Link>
      <PageHeader
        title={event.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><CategoryBadge category={event.category} /><StatusBadge status={event.status} /> {event.publicVisibility ? <Link className="text-primary hover:underline" href={`/parties/${id}`}>View public page →</Link> : "🔒 Private"}</span>}
        action={<StatusActions id={id} status={event.status} organizerName={event.organizerName} />}
      />
      {event.status === "completed" && event.approvedAt && (
        <p className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
          ✅ Approved{event.approvedByEmail ? <> by <strong>{event.approvedByEmail}</strong></> : null} on <strong>{formatDateTime(event.approvedAt)}</strong>. The team&apos;s thanks went to the party giver.
        </p>
      )}
      {event.status === "upcoming" && partyStarted && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          ⏳ <strong>Awaiting approval.</strong> Once {event.organizerName} has given the party, click <strong>Approve party</strong>. It&apos;s marked completed only after approval.
        </p>
      )}
      {pendingThankYou && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          💌 Thank-you email scheduled for <strong>{formatDateTime(pendingThankYou.scheduledAt)}</strong>. Upload bills now and they&apos;ll be included.
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader><CardTitle>Party details</CardTitle></CardHeader>
          <CardContent>
            <EventForm initial={toFormValue(event)} budgetRules={serialize(budget.categories)} validationEnabled={budget.validationEnabled} members={members} />
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>🧾 Bills & attachments</CardTitle></CardHeader>
            <CardContent>
              <BillsManager eventId={id} bills={serialize(bills.items)} maxSizeMb={Math.round(env().MAX_FILE_SIZE / 1024 / 1024)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>📬 Email jobs for this party</CardTitle></CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No emails scheduled yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {serialize(jobs).map((j) => (
                    <li key={j._id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                      <span>
                        {NOTIFICATION_TYPE_LABELS[j.jobType as NotificationType]}
                        <span className="block text-xs text-muted-foreground">{formatDateTime(j.scheduledAt)}{j.lastError ? ` · ${j.lastError}` : ""}</span>
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{j.status}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/admin/notifications" className="mt-3 inline-block text-xs text-primary hover:underline">Manage email queue →</Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
