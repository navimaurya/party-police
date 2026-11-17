import Link from "next/link";
import type { Metadata } from "next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireAdminPage } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { serialize } from "@/lib/utils-server";
import { listLogs } from "@/services/notification.service";
import { NOTIFICATION_TYPE_LABELS, type NotificationType } from "@/types";

export const metadata: Metadata = { title: "Notification Logs" };

const STATUSES = ["sent", "failed", "uncertain", "skipped", "sending"] as const;
const CLS: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  uncertain: "bg-orange-100 text-orange-800",
  skipped: "bg-zinc-100 text-zinc-600",
  sending: "bg-amber-100 text-amber-800",
};

export default async function LogsPage(props: PageProps<"/admin/notifications/logs">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" && (STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total } = await listLogs({ page, limit: 50, status });
  const logs = serialize(items) as unknown as Array<{
    _id: string; subject: string; notificationType: NotificationType; status: string; recipient: string[]; sentAt?: string; createdAt: string; errorMessage?: string; eventId?: { title: string } | null; userId?: { name: string } | null;
  }>;
  const pages = Math.max(1, Math.ceil(total / 50));
  return (
    <div>
      <PageHeader title="📜 Notification Logs" subtitle="Delivery history. 'Uncertain' means a send was interrupted mid-flight — it is never auto-resent; retry it from the queue if needed." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[undefined, ...STATUSES].map((s) => (
          <Link key={s ?? "all"} href={s ? `?status=${s}` : "?"} className={cn("rounded-full border px-3 py-1 text-xs font-medium", status === s ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{s ?? "all"}</Link>
        ))}
      </div>
      {logs.length === 0 ? (
        <EmptyState emoji="📭" message="No emails logged yet." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subject / party</TableHead>
                <TableHead className="hidden lg:table-cell">Recipients</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l._id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(l.sentAt ?? l.createdAt)}</TableCell>
                  <TableCell className="text-xs">{NOTIFICATION_TYPE_LABELS[l.notificationType] ?? l.notificationType}</TableCell>
                  <TableCell className="max-w-64">
                    <p className="truncate text-sm">{l.subject || "—"}</p>
                    {l.eventId?.title && <p className="truncate text-xs text-muted-foreground">🎉 {l.eventId.title}</p>}
                    {l.userId?.name && <p className="truncate text-xs text-muted-foreground">👤 {l.userId.name}</p>}
                  </TableCell>
                  <TableCell className="hidden max-w-48 truncate text-xs lg:table-cell" title={l.recipient.join(", ")}>{l.recipient.length ? `${l.recipient.length} · ${l.recipient[0]}${l.recipient.length > 1 ? "…" : ""}` : "—"}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLS[l.status] ?? ""}`}>{l.status}</span>
                    {l.errorMessage && <p className="max-w-56 truncate text-xs text-muted-foreground" title={l.errorMessage}>{l.errorMessage}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {pages > 1 && (
        <nav className="mt-4 flex justify-center gap-3 text-sm">
          {page > 1 && <Link href={`?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page - 1) })}`}>← Prev</Link>}
          <span className="text-muted-foreground">Page {page} / {pages}</span>
          {page < pages && <Link href={`?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page + 1) })}`}>Next →</Link>}
        </nav>
      )}
    </div>
  );
}
