import Link from "next/link";
import type { Metadata } from "next";
import { JobsTable } from "@/components/admin/jobs-table";
import { PageHeader } from "@/components/admin/page-header";
import { NotificationTypesForm, TestEmailForm } from "@/components/admin/settings-forms";
import { requireAdminPage } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { serialize } from "@/lib/utils-server";
import { listJobs } from "@/services/notification.service";
import { getSettings } from "@/services/settings.service";

export const metadata: Metadata = { title: "Email Notifications" };

const STATUSES = ["pending", "processing", "completed", "failed", "skipped", "cancelled"] as const;

export default async function NotificationsPage(props: PageProps<"/admin/notifications">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" && (STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const [settings, jobs] = await Promise.all([getSettings(), listJobs({ page: 1, limit: 50, status })]);
  return (
    <div className="space-y-6">
      <PageHeader title="📬 Email Notifications" subtitle="Jobs are stored in MongoDB and processed by the background worker. They survive restarts." />
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-6">
          <NotificationTypesForm settings={serialize(settings)} />
          <TestEmailForm />
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {[undefined, ...STATUSES].map((s) => (
              <Link key={s ?? "all"} href={s ? `/admin/notifications?status=${s}` : "/admin/notifications"} className={cn("rounded-full border px-3 py-1 text-xs font-medium", status === s ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
                {s ?? "all"}
              </Link>
            ))}
          </div>
          <JobsTable jobs={serialize(jobs.items) as never} />
        </div>
      </div>
    </div>
  );
}
