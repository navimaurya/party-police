"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, MoreHorizontal, Pencil, RotateCcw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategoryBadge, InstantBadge, StatusBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmButton } from "@/components/admin/confirm";
import { SortHeader } from "@/components/shared/sort-header";
import { EVENT_DEFAULT_SORT } from "@/lib/sort-fields";
import { api, toastError } from "@/lib/api-client";
import { formatMoney, formatPartyDate } from "@/lib/format";
import { EMPTY_STATES } from "@/lib/humor";
import type { EventCardData } from "@/components/events/event-card";
import type { EventStatus } from "@/types";

export function EventsTable({ events, sort = EVENT_DEFAULT_SORT }: { events: (EventCardData & { publicVisibility?: boolean })[]; sort?: string }) {
  const router = useRouter();

  async function setStatus(id: string, status: EventStatus) {
    try {
      await api(`/api/events/${id}/status`, { method: "PATCH", json: { status } });
      toast.success(status === "completed" ? "Approved! Thanks sent to the party giver; everyone gets the thank-you in 5 minutes 💌" : `Status changed to ${status}`);
      router.refresh();
    } catch (err) {
      toastError(err);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/events/${id}`, { method: "DELETE" });
      toast.success("Party deleted (and its files too) 🗑️");
      router.refresh();
    } catch (err) {
      toastError(err);
    }
  }

  if (!events.length) return <EmptyState emoji="🦗" message={EMPTY_STATES.parties} />;

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader field="title" label="Party" current={sort} defaultSort={EVENT_DEFAULT_SORT} />
            <SortHeader field="eventDate" label="Date" current={sort} defaultSort={EVENT_DEFAULT_SORT} className="hidden md:table-cell" />
            <SortHeader field="budget" label="Budget" current={sort} defaultSort={EVENT_DEFAULT_SORT} firstDir="desc" className="hidden sm:table-cell" />
            <SortHeader field="status" label="Status" current={sort} defaultSort={EVENT_DEFAULT_SORT} />
            <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((e) => (
            <TableRow key={e._id}>
              <TableCell className="max-w-72">
                <Link href={`/admin/parties/${e._id}`} className="font-medium hover:text-primary hover:underline">{e.title}</Link>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <CategoryBadge category={e.category} />
                  {e.eventType === "instant" && <InstantBadge />}
                  {e.publicVisibility === false && <span className="rounded bg-zinc-100 px-1.5 py-0.5">🔒 Private</span>}
                  <span>by {e.organizerName}</span>
                </div>
              </TableCell>
              <TableCell className="hidden whitespace-nowrap text-sm md:table-cell">{formatPartyDate(e.eventDate)}</TableCell>
              <TableCell className="hidden text-sm sm:table-cell">{formatMoney(e.budget, e.currency)}</TableCell>
              <TableCell><StatusBadge status={e.status} /></TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${e.title}`} />}>
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push(`/admin/parties/${e._id}`)}><Pencil /> Edit & bills</DropdownMenuItem>
                    {e.status !== "completed" && <DropdownMenuItem onClick={() => setStatus(e._id, "completed")}><BadgeCheck /> Approve party</DropdownMenuItem>}
                    {e.status !== "upcoming" && <DropdownMenuItem onClick={() => setStatus(e._id, "upcoming")}><RotateCcw /> {e.status === "completed" ? "Undo approval" : "Restore to upcoming"}</DropdownMenuItem>}
                    {e.status !== "cancelled" && <DropdownMenuItem onClick={() => setStatus(e._id, "cancelled")}><XCircle /> Cancel party</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
                <ConfirmButton
                  trigger={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${e.title}`} className="text-destructive"><Trash2 /></Button>}
                  title="Delete this party permanently?"
                  description="This deletes the party, cancels pending emails and permanently removes all uploaded bills from disk. This cannot be undone."
                  onConfirm={() => remove(e._id)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
