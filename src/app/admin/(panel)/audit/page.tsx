import Link from "next/link";
import type { Metadata } from "next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireAdminPage } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { serialize } from "@/lib/utils-server";
import { listAuditLogs } from "@/services/audit.service";

export const metadata: Metadata = { title: "Audit Log" };

export default async function AuditPage(props: PageProps<"/admin/audit">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const action = typeof sp.action === "string" ? sp.action.slice(0, 50) : undefined;
  const { items, total } = await listAuditLogs({ page, limit: 50, action });
  const rows = serialize(items);
  const pages = Math.max(1, Math.ceil(total / 50));
  return (
    <div>
      <PageHeader title="🕵️ Audit Log" subtitle="Every admin change, including budget overrides." action={<Link className="text-sm text-primary hover:underline" href="?action=budget.override">Show budget overrides</Link>} />
      {rows.length === 0 ? (
        <EmptyState emoji="📒" message="Nothing logged yet." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Reason / details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r._id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</TableCell>
                  <TableCell><code className="text-xs">{r.action}</code></TableCell>
                  <TableCell className="text-xs">{r.entityType}{r.entityId ? ` · ${String(r.entityId).slice(-6)}` : ""}</TableCell>
                  <TableCell className="max-w-80 truncate text-xs">{r.reason || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {pages > 1 && (
        <nav className="mt-4 flex justify-center gap-3 text-sm">
          {page > 1 && <Link href={`?${new URLSearchParams({ ...(action ? { action } : {}), page: String(page - 1) })}`}>← Prev</Link>}
          <span className="text-muted-foreground">Page {page} / {pages}</span>
          {page < pages && <Link href={`?${new URLSearchParams({ ...(action ? { action } : {}), page: String(page + 1) })}`}>Next →</Link>}
        </nav>
      )}
    </div>
  );
}
