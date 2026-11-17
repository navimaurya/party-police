"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, HandHeart, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton } from "@/components/admin/confirm";
import { NativeSelect } from "@/components/admin/native-select";
import { SortHeader } from "@/components/shared/sort-header";
import { COMMITMENT_DEFAULT_SORT } from "@/lib/sort-fields";
import { EmptyState } from "@/components/shared/empty-state";
import { api, toastError } from "@/lib/api-client";
import { formatDate, toDateInput } from "@/lib/format";
import { EMPTY_STATES } from "@/lib/humor";
import type { CommitmentStatus } from "@/types";

export type CommitmentRow = {
  _id: string;
  personName: string;
  personEmail?: string | null;
  reason: string;
  commitmentDate: string;
  dueDate: string;
  status: CommitmentStatus;
  completedAt?: string | null;
  relatedEventId?: { _id: string; title: string } | string | null;
  notes?: string;
  isPublic?: boolean;
  overdueDays: number;
  tease: string;
};

type EventOption = { _id: string; title: string };

const blank = () => ({
  personName: "",
  personEmail: "",
  reason: "",
  commitmentDate: toDateInput(new Date()),
  dueDate: toDateInput(new Date(Date.now() + 14 * 86400_000)),
  relatedEventId: "",
  notes: "",
  isPublic: true,
});

export function CommitmentsManager({ items, events, sort = COMMITMENT_DEFAULT_SORT }: { items: CommitmentRow[]; events: EventOption[]; sort?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(blank());
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    setEditing(null);
    setForm(blank());
    setOpen(true);
  };
  const openEdit = (c: CommitmentRow) => {
    setEditing(c._id);
    setForm({
      personName: c.personName,
      personEmail: c.personEmail ?? "",
      reason: c.reason,
      commitmentDate: toDateInput(c.commitmentDate),
      dueDate: toDateInput(c.dueDate),
      relatedEventId: typeof c.relatedEventId === "object" && c.relatedEventId ? c.relatedEventId._id : (c.relatedEventId ?? ""),
      notes: c.notes ?? "",
      isPublic: c.isPublic !== false,
    });
    setOpen(true);
  };

  async function save() {
    setBusy(true);
    const payload = {
      ...form,
      commitmentDate: new Date(`${form.commitmentDate}T00:00:00`).toISOString(),
      dueDate: new Date(`${form.dueDate}T23:59:59`).toISOString(),
      relatedEventId: form.relatedEventId || null,
    };
    try {
      await api(editing ? `/api/commitments/${editing}` : "/api/commitments", { method: editing ? "PATCH" : "POST", json: payload });
      toast.success(editing ? "Commitment updated" : `${form.personName} has been added to the Hall of Shame 😈`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(c: CommitmentRow, status: CommitmentStatus) {
    try {
      await api(`/api/commitments/${c._id}`, { method: "PATCH", json: { status } });
      toast.success(status === "completed" ? `${c.personName} is now a Party Legend 🏆` : status === "waived" ? "Debt waived. Very generous. 😇" : "Back on the hook 🎣");
      router.refresh();
    } catch (err) {
      toastError(err);
    }
  }

  async function remove(c: CommitmentRow) {
    try {
      await api(`/api/commitments/${c._id}`, { method: "DELETE" });
      toast.success("Deleted");
      router.refresh();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus /> Add party debt</Button>
      </div>
      {items.length === 0 ? (
        <EmptyState emoji="😇" message={EMPTY_STATES.shame} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader field="personName" label="Person" current={sort} defaultSort={COMMITMENT_DEFAULT_SORT} />
                <TableHead className="hidden md:table-cell">Reason</TableHead>
                <SortHeader field="dueDate" label="Due" current={sort} defaultSort={COMMITMENT_DEFAULT_SORT} />
                <SortHeader field="status" label="Status" current={sort} defaultSort={COMMITMENT_DEFAULT_SORT} />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c._id}>
                  <TableCell>
                    <p className="font-medium">{c.personName} {c.isPublic === false && <span title="Hidden from public">🔒</span>}</p>
                    <p className="text-xs text-muted-foreground md:hidden">{c.reason}</p>
                    {c.personEmail && <p className="text-xs text-muted-foreground">{c.personEmail}</p>}
                  </TableCell>
                  <TableCell className="hidden max-w-60 md:table-cell">
                    <p className="truncate">{c.reason}</p>
                    {typeof c.relatedEventId === "object" && c.relatedEventId && <p className="truncate text-xs text-muted-foreground">🎉 {c.relatedEventId.title}</p>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(c.dueDate)}
                    {c.status === "pending" && c.overdueDays > 0 && <span className="block text-xs font-semibold text-red-600">{c.overdueDays}d overdue</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.status === "pending" ? <span className="text-xs italic">{c.tease}</span> : c.status === "completed" ? <span className="text-emerald-700">✅ Paid {formatDate(c.completedAt)}</span> : <span className="text-muted-foreground">Waived</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {c.status === "pending" ? (
                        <>
                          <Button size="icon-sm" variant="ghost" title="Mark party completed" aria-label="Mark completed" onClick={() => setStatus(c, "completed")}><CheckCircle2 className="text-emerald-600" /></Button>
                          <Button size="icon-sm" variant="ghost" title="Waive" aria-label="Waive" onClick={() => setStatus(c, "waived")}><HandHeart /></Button>
                        </>
                      ) : (
                        <Button size="icon-sm" variant="ghost" title="Reopen" aria-label="Reopen" onClick={() => setStatus(c, "pending")}><RotateCcw /></Button>
                      )}
                      <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => openEdit(c)}><Pencil /></Button>
                      <ConfirmButton trigger={<Button size="icon-sm" variant="ghost" className="text-destructive" aria-label="Delete"><Trash2 /></Button>} title="Delete this commitment?" description="It will disappear from the Hall of Shame and Legends." onConfirm={() => remove(c)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit party debt" : "Who owes us a party? 😈"}</DialogTitle></DialogHeader>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="space-y-1"><Label htmlFor="c-name">Person *</Label><Input id="c-name" required maxLength={100} value={form.personName} onChange={(e) => setForm({ ...form, personName: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="c-email">Email (for reminders)</Label><Input id="c-email" type="email" value={form.personEmail} onChange={(e) => setForm({ ...form, personEmail: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="c-reason">Reason *</Label><Input id="c-reason" required maxLength={300} placeholder="Promotion to Senior Engineer" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="c-cdate">Commitment date</Label><Input id="c-cdate" type="date" required value={form.commitmentDate} onChange={(e) => setForm({ ...form, commitmentDate: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="c-due">Due date</Label><Input id="c-due" type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="c-event">Related party (completing it clears this debt)</Label>
              <NativeSelect id="c-event" value={form.relatedEventId} onChange={(e) => setForm({ ...form, relatedEventId: e.target.value })}>
                <option value="">— none —</option>
                {events.map((ev) => <option key={ev._id} value={ev._id}>{ev.title}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="c-notes">Private notes</Label><Textarea id="c-notes" rows={2} maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={form.isPublic} onCheckedChange={(c) => setForm({ ...form, isPublic: c })} /> Show in public Hall of Shame</label>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
