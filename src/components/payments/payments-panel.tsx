"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmButton } from "@/components/admin/confirm";
import { NativeSelect } from "@/components/admin/native-select";
import { api, toastError } from "@/lib/api-client";
import { formatRupees } from "@/lib/contri";
import { formatDate, toDateInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PartyPaymentsData, PaymentSummary, PaymentView, RoleView } from "@/services/payment.service";
import {
  MONEY_ROLE_LABELS,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_VIEW_STATUSES,
  type MoneyRole,
  type PaymentMethod,
  type PaymentViewStatus,
} from "@/types";

type Person = { name: string; email?: string | null };
/** A signed-in team member (money givers and providers are usually picked from these). */
export type PaymentMember = { name: string; email: string; upiId?: string };
type Filter = PaymentViewStatus | "all";

const STATUS_STYLE: Record<PaymentViewStatus, string> = {
  pending: "border-sky-200 bg-sky-100 text-sky-800",
  partially_paid: "border-amber-200 bg-amber-100 text-amber-900",
  paid: "border-emerald-200 bg-emerald-100 text-emerald-800",
  overdue: "border-red-200 bg-red-100 text-red-700",
};

export function PaymentStatusBadge({ status }: { status: PaymentViewStatus }) {
  return <Badge variant="outline" className={STATUS_STYLE[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>;
}

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
const payeeLabel = (r: Pick<RoleView, "name" | "role">) => `${r.name} (${r.role === "lender" ? "money giver" : "provider"})`;

/* ------------------------------- the panel -------------------------------- */

/** Payments section of a party page: overview, lenders & providers, and every obligation. */
export function PaymentsPanel({ data, people, members = [] }: { data: PartyPaymentsData; people: Person[]; members?: PaymentMember[] }) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  async function enableMoneyGivers() {
    setSwitching(true);
    try {
      await api(`/api/events/${data.eventId}`, { method: "PATCH", json: { paymentModel: "lender_provider" } });
      toast.success("Money givers & providers turned on");
      router.refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setSwitching(false);
    }
  }
  const lenderModel = data.paymentModel === "lender_provider";
  const [shareDialog, setShareDialog] = useState<{ open: boolean; editing: PaymentView | null }>({ open: false, editing: null });
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; editing: RoleView | null }>({ open: false, editing: null });

  return (
    <div className="space-y-5">
      <SummaryGrid s={data.summary} lenderModel={lenderModel} />

      {data.canManage && lenderModel && (
        <RolesSection eventId={data.eventId} roles={data.roles} onAdd={() => setRoleDialog({ open: true, editing: null })} onEdit={(r) => setRoleDialog({ open: true, editing: r })} />
      )}
      {data.canManage && !lenderModel && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
          <span>Did the party giver borrow money from someone? Add them as a <strong>money giver</strong>, so the giver (or the participants) can pay them back.</span>
          <Button size="xs" variant="outline" disabled={switching} onClick={() => void enableMoneyGivers()}>{switching && <Loader2 className="animate-spin" />} Add a money giver</Button>
        </div>
      )}

      <PaymentsTable
        eventId={data.eventId}
        payments={data.payments}
        counts={data.summary.counts}
        canManage={data.canManage}
        onEdit={(p) => setShareDialog({ open: true, editing: p })}
        toolbar={data.canManage ? <Button size="sm" onClick={() => setShareDialog({ open: true, editing: null })}><Plus /> Assign a share</Button> : null}
      />

      {data.canManage && (
        <>
          <ShareDialog key={`s-${shareDialog.editing?._id ?? "new"}-${shareDialog.open}`} eventId={data.eventId} state={shareDialog} onClose={() => setShareDialog({ open: false, editing: null })} people={people} roles={data.roles} />
          <RoleDialog key={`r-${roleDialog.editing?._id ?? "new"}-${roleDialog.open}`} eventId={data.eventId} state={roleDialog} onClose={() => setRoleDialog({ open: false, editing: null })} people={people} members={members} />
        </>
      )}
    </div>
  );
}

function SummaryGrid({ s, lenderModel }: { s: PaymentSummary; lenderModel: boolean }) {
  const tiles = [
    { label: "Party budget", value: s.budget != null ? formatRupees(s.budget) : "—" },
    { label: "Assigned in shares", value: formatRupees(s.assigned) },
    { label: "Collected from shares", value: formatRupees(s.collected) },
    ...(lenderModel || s.lent > 0 ? [{ label: "Borrowed / repaid", value: `${formatRupees(s.lentRepaid)} of ${formatRupees(s.lent)}`, hint: s.lentDue > 0 ? `${formatRupees(s.lentDue)} still owed to money givers` : undefined }] : []),
    { label: "Total paid", value: formatRupees(s.paid) },
    { label: "Total outstanding", value: formatRupees(s.outstanding), tone: s.outstanding > 0 ? "text-red-700" : "text-emerald-700" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border bg-background p-2.5">
          <p className="text-xs text-muted-foreground">{t.label}</p>
          <p className={cn("mt-1 font-heading text-lg font-bold leading-tight", "tone" in t && t.tone)}>{t.value}</p>
          {"hint" in t && t.hint && <p className="text-xs text-amber-700">{t.hint}</p>}
        </div>
      ))}
    </div>
  );
}

/* --------------------------- lenders & providers --------------------------- */

function RolesSection({ eventId, roles, onAdd, onEdit }: { eventId: string; roles: RoleView[]; onAdd: () => void; onEdit: (r: RoleView) => void }) {
  const router = useRouter();
  async function remove(r: RoleView) {
    try {
      await api(`/api/events/${eventId}/money-roles/${r._id}`, { method: "DELETE" });
      toast.success(`${r.name} removed`);
      router.refresh();
    } catch (err) {
      toastError(err);
    }
  }
  return (
    <div className="space-y-2 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Money givers &amp; providers</h3>
          <p className="text-xs text-muted-foreground">Money givers lent the party giver money and get it back. Providers collect payments. Both can mark the payments they receive.</p>
        </div>
        <Button size="sm" variant="outline" onClick={onAdd}><Plus /> Add</Button>
      </div>
      {roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No money givers or providers yet.</p>
      ) : (
        <ul className="divide-y">
          {roles.map((r) => (
            <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <Badge variant="outline" className={r.role === "lender" ? "border-violet-200 bg-violet-100 text-violet-800" : "border-teal-200 bg-teal-100 text-teal-800"}>{MONEY_ROLE_LABELS[r.role]}</Badge>{" "}
                <strong>{r.name}</strong>
                {r.email && <span className="text-muted-foreground"> · {r.email}</span>}
                <span className="block text-xs text-muted-foreground">{r.effectiveUpiId ? <>UPI {r.effectiveUpiId}{!r.upiId && " (from profile)"}</> : <span className="text-amber-700">No UPI ID: no QR for payments to them</span>}</span>
              </span>
              <span className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => onEdit(r)}><Pencil /></Button>
                <ConfirmButton
                  trigger={<Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Remove ${r.name}`}><Trash2 /></Button>}
                  title={`Remove ${r.name}?`}
                  description={r.role === "lender" ? "The borrowed-money record is removed too. Not possible once repayments were recorded or while shares go to them." : "Not possible while payments go to them."}
                  confirmLabel="Remove"
                  onConfirm={() => remove(r)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoleDialog({ eventId, state, onClose, people, members }: { eventId: string; state: { open: boolean; editing: RoleView | null }; onClose: () => void; people: Person[]; members: PaymentMember[] }) {
  const router = useRouter();
  const r = state.editing;
  const [f, setF] = useState({ role: (r?.role ?? "lender") as MoneyRole, name: r?.name ?? "", email: r?.email ?? "", upiId: r?.upiId ?? "", lentAmount: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const picked = members.find((m) => m.email === f.email.toLowerCase());
  const lender = f.role === "lender";

  async function save() {
    setBusy(true);
    try {
      if (r) {
        await api(`/api/events/${eventId}/money-roles/${r._id}`, { method: "PATCH", json: { name: f.name, email: f.email, upiId: f.upiId.trim() } });
      } else {
        await api(`/api/events/${eventId}/money-roles`, {
          method: "POST",
          json: { role: f.role, name: f.name, email: f.email, upiId: f.upiId.trim(), ...(lender ? { lentAmount: num(f.lentAmount), dueDate: f.dueDate || null } : {}) },
        });
      }
      toast.success(r ? "Saved" : `${f.name} added`);
      onClose();
      router.refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{r ? `Edit ${MONEY_ROLE_LABELS[r.role].toLowerCase()}` : lender ? "Add a money giver" : "Add a provider"}</DialogTitle>
          <DialogDescription>{lender ? "A team member the party giver borrowed money from. The giver (or the participants, via “Pays to”) pays them back." : "Someone who receives payments from participants."}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {!r && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="role-kind">Role</Label>
              <NativeSelect id="role-kind" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as MoneyRole })}>
                <option value="lender">Money giver: lent the party giver money</option>
                <option value="provider">Provider: collects payments</option>
              </NativeSelect>
            </div>
          )}
          {members.length > 0 && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="role-user">{lender ? "Who gave the money?" : "Who collects?"}</Label>
              <NativeSelect
                id="role-user"
                value={picked?.email ?? ""}
                onChange={(e) => {
                  const m = members.find((x) => x.email === e.target.value);
                  setF(m ? { ...f, name: m.name, email: m.email } : { ...f, name: "", email: "" });
                }}
              >
                <option value="">— Someone else (type below) —</option>
                {members.map((m) => <option key={m.email} value={m.email}>{m.name} · {m.email}</option>)}
              </NativeSelect>
            </div>
          )}
          {!picked && <PersonFields idPrefix="role" people={people} name={f.name} email={f.email} onChange={(name, email) => setF({ ...f, name, email })} />}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="role-upi">UPI ID</Label>
            <Input id="role-upi" maxLength={100} autoComplete="off" placeholder={picked?.upiId ? `Empty = ${picked.upiId} (from their profile)` : "Empty = the UPI ID on their profile"} value={f.upiId} onChange={(e) => setF({ ...f, upiId: e.target.value })} />
            <p className="text-xs text-muted-foreground">Payment QR codes to {f.name || "them"} pay this UPI ID.</p>
          </div>
          {!r && lender && (
            <>
              <div className="space-y-1">
                <Label htmlFor="role-amount">Amount borrowed (₹) *</Label>
                <Input id="role-amount" type="number" required min={0.01} step="0.01" inputMode="decimal" value={f.lentAmount} onChange={(e) => setF({ ...f, lentAmount: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="role-due">Repay by</Label>
                <Input id="role-due" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">The party giver now owes this amount to {f.name || "the money giver"}. Participants can also pay their shares straight to them: pick them under <strong>Pays to</strong>.</p>
            </>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || !f.name.trim()}>{busy && <Loader2 className="animate-spin" />} Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Name + email, with the party's people suggested. */
function PersonFields({ idPrefix, people, name, email, onChange, disabled }: { idPrefix: string; people: Person[]; name: string; email: string; onChange: (name: string, email: string) => void; disabled?: boolean }) {
  const pick = (value: string) => {
    const p = people.find((x) => x.name === value);
    onChange(value, p?.email ?? (p ? "" : email));
  };
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-name`}>Name *</Label>
        <Input id={`${idPrefix}-name`} required maxLength={100} list={`${idPrefix}-people`} disabled={disabled} value={name} onChange={(e) => pick(e.target.value)} />
        <datalist id={`${idPrefix}-people`}>{people.map((p) => <option key={`${p.name}-${p.email ?? ""}`} value={p.name}>{p.email ?? ""}</option>)}</datalist>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-email`}>Email (so they can see it)</Label>
        <Input id={`${idPrefix}-email`} type="email" maxLength={200} disabled={disabled} value={email} onChange={(e) => onChange(name, e.target.value)} />
      </div>
    </>
  );
}

/* ------------------------------ shares dialog ------------------------------ */

function ShareDialog({ eventId, state, onClose, people, roles }: { eventId: string; state: { open: boolean; editing: PaymentView | null }; onClose: () => void; people: Person[]; roles: RoleView[] }) {
  const router = useRouter();
  const p = state.editing;
  const lend = p?.kind === "lend";
  const [f, setF] = useState({
    payerName: p?.payerName ?? "",
    payerEmail: p?.payerEmail ?? "",
    amount: p ? String(p.total) : "",
    payeeRoleId: p?.payee.roleId ?? "",
    dueDate: p?.dueDate ?? "",
    note: p?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const receivedMoney = !!p && p.paid > 0;
  // Money givers first: paying them directly is the common case.
  const payees = [...roles].sort((a, b) => (a.role === b.role ? 0 : a.role === "lender" ? -1 : 1));

  async function save() {
    setBusy(true);
    const json = {
      ...(lend ? {} : { payerName: f.payerName, payerEmail: f.payerEmail }),
      amount: num(f.amount),
      payeeRoleId: f.payeeRoleId || null,
      dueDate: f.dueDate || null,
      note: f.note,
    };
    try {
      if (p) await api(`/api/events/${eventId}/payments/${p._id}`, { method: "PATCH", json });
      else await api(`/api/events/${eventId}/payments`, { method: "POST", json: { kind: "share", ...json } });
      toast.success(p ? "Saved" : `Share assigned to ${f.payerName}`);
      onClose();
      router.refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{p ? (lend ? `Borrowed from ${p.payee.name}` : `Edit ${p.payerName}'s ${PAYMENT_KIND_LABELS[p.kind].toLowerCase()}`) : "Assign a share"}</DialogTitle>
          <DialogDescription>Each person can have their own amount. They see only their own share, with a QR for what they still owe.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {!lend && <PersonFields idPrefix="share" people={people} name={f.payerName} email={f.payerEmail} disabled={receivedMoney} onChange={(payerName, payerEmail) => setF({ ...f, payerName, payerEmail })} />}
          <div className="space-y-1">
            <Label htmlFor="share-amount">Amount (₹) *</Label>
            <Input id="share-amount" type="number" required min={p?.paid || 0.01} step="0.01" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            {receivedMoney && <p className="text-xs text-muted-foreground">{formatRupees(p!.paid)} already paid; can&apos;t go lower.</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="share-due">Due date</Label>
            <Input id="share-due" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="share-payee">Pays to</Label>
            <NativeSelect id="share-payee" value={f.payeeRoleId} disabled={receivedMoney || lend} onChange={(e) => setF({ ...f, payeeRoleId: e.target.value })}>
              <option value="">The party giver</option>
              {payees.map((r) => <option key={r._id} value={r._id}>{payeeLabel(r)}</option>)}
            </NativeSelect>
            {!lend && payees.length === 0 && <p className="text-xs text-muted-foreground">To pay a money giver directly, add them first under <strong>Money givers &amp; providers</strong>.</p>}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="share-note">Note</Label>
            <Input id="share-note" maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Two pizzas + a drink" />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ payments table ------------------------------ */

/**
 * Every obligation the viewer can see, with status filters, "View" (QR + history) and "Mark paid".
 * Also used on "My payments", where the viewer only sees their own (and what they collect).
 */
export function PaymentsTable({
  eventId,
  payments,
  counts,
  canManage,
  onEdit,
  toolbar,
}: {
  eventId: string;
  payments: PaymentView[];
  counts?: Record<Filter, number>;
  canManage: boolean;
  onEdit?: (p: PaymentView) => void;
  toolbar?: React.ReactNode;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [viewing, setViewing] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const shown = filter === "all" ? payments : payments.filter((p) => p.status === filter);
  const count = (f: Filter) => counts?.[f] ?? (f === "all" ? payments.length : payments.filter((p) => p.status === f).length);
  // Look rows up by id so the dialogs show fresh numbers after router.refresh().
  const viewed = payments.find((p) => p._id === viewing) ?? null;
  const payingRow = payments.find((p) => p._id === paying) ?? null;

  async function remove(p: PaymentView) {
    try {
      await api(`/api/events/${eventId}/payments/${p._id}`, { method: "DELETE" });
      toast.success("Removed");
      router.refresh();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-xl border p-1" role="tablist" aria-label="Filter payments">
          {(["all", ...PAYMENT_VIEW_STATUSES] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn("rounded-lg px-3 py-1 text-xs font-medium transition", filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {f === "all" ? "All" : PAYMENT_STATUS_LABELS[f]} <span className="opacity-70">{count(f)}</span>
            </button>
          ))}
        </div>
        {toolbar}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{payments.length === 0 ? "No payments yet." : "Nothing with this status."}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Who pays</TableHead>
                <TableHead className="text-right">Assigned</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((p) => (
                <TableRow key={p._id}>
                  <TableCell>
                    <p className="font-medium">{p.payerName}{p.isMine && <span className="ml-1 text-xs text-primary">(you)</span>}</p>
                    <p className="text-xs text-muted-foreground">
                      {PAYMENT_KIND_LABELS[p.kind]} → {p.payee.role === "host" ? `${p.payee.name} (party giver)` : payeeLabel({ name: p.payee.name, role: p.payee.role })}
                      {p.dueDate && <> · due {formatDate(p.dueDate)}</>}
                      {p.auto && <> · from the contri split</>}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupees(p.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupees(p.paid)}</TableCell>
                  <TableCell className={cn("text-right font-semibold tabular-nums", p.due > 0 ? "text-red-700" : "text-emerald-700")}>{formatRupees(p.due)}</TableCell>
                  <TableCell><PaymentStatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" title="View QR & history" aria-label={`View ${p.payerName}`} onClick={() => setViewing(p._id)}><Eye /></Button>
                      {p.canRecord && p.due > 0 && <Button size="xs" variant="outline" onClick={() => setPaying(p._id)}><CheckCircle2 className="text-emerald-600" /> {p.isMine && !canManage ? "I've paid" : "Mark paid"}</Button>}
                      {canManage && onEdit && <Button size="icon-sm" variant="ghost" aria-label={`Edit ${p.payerName}`} onClick={() => onEdit(p)}><Pencil /></Button>}
                      {canManage && p.kind !== "lend" && !p.auto && p.paid === 0 && !p.transactions.some((t) => !t.voided) && (
                        <ConfirmButton trigger={<Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Remove ${p.payerName}`}><Trash2 /></Button>} title={`Remove ${p.payerName}'s ${PAYMENT_KIND_LABELS[p.kind].toLowerCase()}?`} description="Nothing was paid against it yet." confirmLabel="Remove" onConfirm={() => remove(p)} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {viewed && <ViewDialog key={viewed._id} p={viewed} canManage={canManage} onClose={() => setViewing(null)} onPay={() => { setViewing(null); setPaying(viewed._id); }} />}
      {payingRow && <MarkPaidDialog key={payingRow._id} p={payingRow} self={payingRow.isMine && !canManage} onClose={() => setPaying(null)} />}
    </div>
  );
}

/* ------------------------------ view (QR + history) ------------------------------ */

function ViewDialog({ p, canManage, onClose, onPay }: { p: PaymentView; canManage: boolean; onClose: () => void; onPay: () => void }) {
  const router = useRouter();
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function voidTx() {
    if (!voiding) return;
    setBusy(true);
    try {
      await api(`/api/events/${p.eventId}/payments/${p._id}/transactions/${voiding.id}/void`, { method: "POST", json: { reason: voiding.reason } });
      toast.success("Payment voided");
      setVoiding(null);
      router.refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{p.payerName} · {PAYMENT_KIND_LABELS[p.kind]}</DialogTitle>
          <DialogDescription>
            Pays <strong>{p.payee.name}</strong>{p.payee.role === "host" ? " (party giver)" : ` (${p.payee.role === "lender" ? "money giver" : "provider"})`}{p.dueDate && <> · due {formatDate(p.dueDate)}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Assigned</p><p className="font-semibold">{formatRupees(p.total)}</p></div>
          <div className="rounded-lg bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Paid</p><p className="font-semibold">{formatRupees(p.paid)}</p></div>
          <div className="rounded-lg bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Due</p><p className="font-semibold text-red-700">{formatRupees(p.due)}</p></div>
        </div>
        <div className="flex items-center gap-2"><PaymentStatusBadge status={p.status} />{p.note && <span className="text-sm text-muted-foreground">{p.note}</span>}</div>

        {p.due > 0 && (
          p.upiLink ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
              {/* Generated by our server for exactly the outstanding amount; refreshed when it changes. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image, not next/image */}
              <img src={`/api/events/${p.eventId}/payments/${p._id}/qr?v=${p.revision}`} alt={`UPI QR code to pay ${formatRupees(p.due)} to ${p.payee.name}`} className="size-48 rounded-xl border bg-white" />
              <p className="text-center text-sm">Scan to pay <strong>{formatRupees(p.due)}</strong> to <strong>{p.payee.name}</strong><br /><span className="break-all text-xs text-muted-foreground">UPI ID {p.payee.upiId}</span></p>
              <a href={p.upiLink} className="rounded-full bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 sm:hidden">Pay in a UPI app</a>
              <p className="text-center text-xs text-muted-foreground">Scanning doesn&apos;t mark it paid. Once the money is sent, tap <strong>{p.isMine ? "I've paid" : "Mark paid"}</strong>.</p>
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{p.payee.name} has no UPI ID yet, so there&apos;s no QR code. Pay them in cash or ask for it.</p>
          )
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Payment history</h4>
          {p.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {p.transactions.map((t) => (
                <li key={t._id} className={cn("rounded-lg border p-2", t.voided && "opacity-60")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("font-semibold", t.voided && "line-through")}>{formatRupees(t.amount)} · {PAYMENT_METHOD_LABELS[t.method]}</span>
                    {canManage && !t.voided && <Button size="xs" variant="ghost" className="text-destructive" onClick={() => setVoiding({ id: t._id, reason: "" })}><Ban /> Void</Button>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Paid {formatDate(t.paidAt)}{t.reference && <> · ref <span className="font-mono">{t.reference}</span></>} · marked by {t.recordedByName || t.recordedByEmail}{t.selfReported && " (self-reported)"} on {formatDate(t.createdAt)}
                  </p>
                  {t.note && <p className="text-xs">{t.note}</p>}
                  {t.voided && <p className="text-xs text-red-700">Voided by {t.voidedByEmail} on {formatDate(t.voidedAt)}: {t.voidReason}</p>}
                  {voiding?.id === t._id && (
                    <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void voidTx(); }}>
                      <Input autoFocus required maxLength={300} placeholder="Why? e.g. recorded twice" value={voiding.reason} onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })} />
                      <Button type="submit" size="sm" variant="destructive" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Void</Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {p.canRecord && p.due > 0 && <Button onClick={onPay}><CheckCircle2 /> {p.isMine && !canManage ? "I've paid" : "Mark paid"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ mark as paid ------------------------------ */

/** "I've paid": the payer records their own payment (e.g. from the contri card). */
export function SelfPayButton({ p }: { p: PaymentView }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><CheckCircle2 /> I&apos;ve paid</Button>
      {open && <MarkPaidDialog p={p} self onClose={() => setOpen(false)} />}
    </>
  );
}

function MarkPaidDialog({ p, self = false, onClose }: { p: PaymentView; self?: boolean; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ amount: String(p.due), method: "upi" as PaymentMethod, reference: "", paidOn: toDateInput(new Date()), note: "" });
  // One key per dialog: a double click or retry of the same submit is recorded once.
  const [key] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const amount = num(f.amount) ?? 0;
  const after = Math.max(0, Math.round((p.due - amount) * 100) / 100);
  const tooMuch = amount > p.due;

  async function save() {
    setBusy(true);
    try {
      const res = await api<{ duplicate: boolean }>(`/api/events/${p.eventId}/payments/${p._id}/transactions`, {
        method: "POST",
        json: { amount, method: f.method, reference: f.reference, paidOn: f.paidOn, note: f.note, idempotencyKey: key },
      });
      toast.success(res.duplicate ? "Already recorded" : after === 0 ? (self ? "Marked as paid ✅ Thanks!" : `${p.payerName} is fully paid ✅`) : `${formatRupees(amount)} recorded. ${formatRupees(after)} still due.`);
      onClose();
      router.refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{self ? `I've paid ${p.payee.name}` : `Mark as paid: ${p.payerName}`}</DialogTitle>
          <DialogDescription>
            {self
              ? <>Only after the money has actually left your account. {formatRupees(p.due)} is due. {p.payee.name} and the organizer see that you marked it yourself.</>
              : <>Record money that actually reached {p.payee.name}. {formatRupees(p.due)} is due.</>}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="pay-amount">{self ? "Amount you paid (₹) *" : "Amount received (₹) *"}</Label>
            <div className="flex gap-2">
              <Input id="pay-amount" type="number" required min={0.01} max={p.due} step="0.01" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
              <Button type="button" variant="outline" onClick={() => setF({ ...f, amount: String(p.due) })}>Full</Button>
            </div>
            <p className={cn("text-xs", tooMuch ? "text-red-700" : "text-muted-foreground")}>
              {tooMuch ? `Only ${formatRupees(p.due)} is due.` : after === 0 ? "This settles it in full." : `Partial payment: ${formatRupees(after)} will still be due.`}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay-method">Method</Label>
            <NativeSelect id="pay-method" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PaymentMethod })}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay-date">Paid on</Label>
            <Input id="pay-date" type="date" required max={toDateInput(new Date())} value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="pay-ref">Transaction reference (UPI / bank)</Label>
            <Input id="pay-ref" maxLength={100} autoComplete="off" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="e.g. 4321 0987 6543" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="pay-note">Note</Label>
            <Input id="pay-note" maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || tooMuch || amount <= 0}>{busy && <Loader2 className="animate-spin" />} Record payment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
