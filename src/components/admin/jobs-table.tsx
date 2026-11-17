"use client";

import { useRouter } from "next/navigation";
import { Ban, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { api, toastError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { NOTIFICATION_TYPE_LABELS, type NotificationType } from "@/types";

export type JobRow = {
  _id: string;
  jobType: NotificationType;
  status: string;
  scheduledAt: string;
  retryCount: number;
  lastError?: string;
  lastAttemptAt?: string | null;
  eventId?: { _id: string; title: string } | null;
  commitmentId?: { _id: string; personName: string } | null;
  userId?: { _id: string; name: string; email: string } | null;
};

const STATUS_CLS: Record<string, string> = {
  pending: "bg-sky-100 text-sky-700",
  processing: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-600",
  skipped: "bg-zinc-100 text-zinc-600",
};

export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  const router = useRouter();
  const act = async (id: string, action: "retry" | "cancel") => {
    try {
      await api(`/api/notifications/${id}/${action}`, { method: "POST" });
      toast.success(action === "retry" ? "Re-queued 🔁" : "Cancelled");
      router.refresh();
    } catch (err) {
      toastError(err);
    }
  };
  if (!jobs.length) return <EmptyState emoji="📭" message="The email queue is empty. Suspiciously peaceful." />;
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Scheduled</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((j) => (
            <TableRow key={j._id}>
              <TableCell className="text-sm">{NOTIFICATION_TYPE_LABELS[j.jobType] ?? j.jobType}</TableCell>
              <TableCell className="max-w-48 truncate text-sm">{j.eventId?.title ?? j.commitmentId?.personName ?? (j.userId ? `👤 ${j.userId.name}` : "—")}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">{formatDateTime(j.scheduledAt)}</TableCell>
              <TableCell>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[j.status] ?? ""}`}>{j.status}</span>
                {j.retryCount > 0 && <span className="ml-1 text-xs text-muted-foreground">×{j.retryCount}</span>}
                {j.lastError && <p className="max-w-56 truncate text-xs text-muted-foreground" title={j.lastError}>{j.lastError}</p>}
              </TableCell>
              <TableCell className="text-right">
                {j.status === "pending" && <Button size="sm" variant="ghost" onClick={() => act(j._id, "cancel")}><Ban /> Cancel</Button>}
                {["failed", "skipped", "cancelled"].includes(j.status) && <Button size="sm" variant="ghost" onClick={() => act(j._id, "retry")}><RefreshCw /> Retry</Button>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
