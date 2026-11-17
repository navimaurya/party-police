"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton } from "@/components/admin/confirm";
import { NativeSelect } from "@/components/admin/native-select";
import { EmptyState } from "@/components/shared/empty-state";
import { api, toastError } from "@/lib/api-client";
import { formatDate, formatMoney, toDateInput } from "@/lib/format";
import { CATEGORY_LABELS, EVENT_CATEGORIES, type EventCategory } from "@/types";
import { SortHeader } from "@/components/shared/sort-header";
import { DISCOUNT_DEFAULT_SORT } from "@/lib/sort-fields";

export type DiscountRow = {
  _id: string;
  title: string;
  description?: string;
  code?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  applicableVenue?: string;
  applicableCategories?: EventCategory[];
  validFrom?: string | null;
  validUntil?: string | null;
  termsAndConditions?: string;
  isActive: boolean;
};

const blank = {
  title: "",
  description: "",
  code: "",
  discountType: "percentage" as "percentage" | "fixed",
  discountValue: "",
  applicableVenue: "",
  applicableCategories: [] as EventCategory[],
  validFrom: "",
  validUntil: "",
  termsAndConditions: "",
  isActive: true,
};

function visibility(d: DiscountRow) {
  const now = Date.now();
  if (!d.isActive) return { label: "Inactive", cls: "bg-zinc-100 text-zinc-600" };
  if (d.validUntil && new Date(d.validUntil).getTime() < now) return { label: "Expired", cls: "bg-red-100 text-red-700" };
  if (d.validFrom && new Date(d.validFrom).getTime() > now) return { label: "Scheduled", cls: "bg-sky-100 text-sky-700" };
  return { label: "Live", cls: "bg-emerald-100 text-emerald-700" };
}

export function DiscountsManager({ items, sort = DISCOUNT_DEFAULT_SORT }: { items: DiscountRow[]; sort?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);

  const edit = (d: DiscountRow) => {
    setEditing(d._id);
    setF({
      title: d.title,
      description: d.description ?? "",
      code: d.code ?? "",
      discountType: d.discountType,
      discountValue: String(d.discountValue),
      applicableVenue: d.applicableVenue ?? "",
      applicableCategories: d.applicableCategories ?? [],
      validFrom: toDateInput(d.validFrom),
      validUntil: toDateInput(d.validUntil),
      termsAndConditions: d.termsAndConditions ?? "",
      isActive: d.isActive,
    });
    setOpen(true);
  };

  async function save() {
    setBusy(true);
    const payload = {
      ...f,
      discountValue: Number(f.discountValue),
      validFrom: f.validFrom ? new Date(`${f.validFrom}T00:00:00`).toISOString() : null,
      validUntil: f.validUntil ? new Date(`${f.validUntil}T23:59:59`).toISOString() : null,
    };
    try {
      await api(editing ? `/api/discounts/${editing}` : "/api/discounts", { method: editing ? "PATCH" : "POST", json: payload });
      toast.success(editing ? "Deal updated" : "New party deal created 🍕");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(d: DiscountRow) {
    try {
      await api(`/api/discounts/${d._id}`, { method: "PATCH", json: { isActive: !d.isActive } });
      router.refresh();
    } catch (err) {
      toastError(err);
    }
  }

  async function remove(d: DiscountRow) {
    try {
      await api(`/api/discounts/${d._id}`, { method: "DELETE" });
      toast.success("Deal deleted");
      router.refresh();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setF(blank); setOpen(true); }}><Plus /> New deal</Button>
      </div>
      {items.length === 0 ? (
        <EmptyState emoji="💸" message="No deals yet. The public discount section stays hidden until you add one." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader field="title" label="Deal" current={sort} defaultSort={DISCOUNT_DEFAULT_SORT} />
                <SortHeader field="value" label="Value" current={sort} defaultSort={DISCOUNT_DEFAULT_SORT} firstDir="desc" />
                <SortHeader field="validUntil" label="Validity" current={sort} defaultSort={DISCOUNT_DEFAULT_SORT} className="hidden md:table-cell" />
                <SortHeader field="isActive" label="Public" current={sort} defaultSort={DISCOUNT_DEFAULT_SORT} firstDir="desc" />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((d) => {
                const vis = visibility(d);
                return (
                  <TableRow key={d._id}>
                    <TableCell className="max-w-64">
                      <p className="truncate font-medium">{d.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {d.code && <code className="mr-1 rounded bg-muted px-1">{d.code}</code>}
                        {d.applicableVenue && `📍 ${d.applicableVenue} `}
                        {d.applicableCategories?.length ? `🎯 ${d.applicableCategories.map((c) => CATEGORY_LABELS[c]).join(", ")}` : "🎯 All categories"}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{d.discountType === "percentage" ? `${d.discountValue}%` : formatMoney(d.discountValue)}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm md:table-cell">{d.validFrom ? formatDate(d.validFrom) : "Anytime"} → {d.validUntil ? formatDate(d.validUntil) : "∞"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={d.isActive} onCheckedChange={() => toggle(d)} aria-label="Active" />
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${vis.cls}`}>{vis.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => edit(d)}><Pencil /></Button>
                      <ConfirmButton trigger={<Button size="icon-sm" variant="ghost" className="text-destructive" aria-label="Delete"><Trash2 /></Button>} title="Delete this deal?" description="It will be removed from the public site immediately." onConfirm={() => remove(d)} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit deal" : "🍕 New party deal"}</DialogTitle></DialogHeader>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="d-title">Title *</Label><Input id="d-title" required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Get 20% OFF on your party order!" /></div>
            <div className="space-y-1">
              <Label htmlFor="d-type">Type</Label>
              <NativeSelect id="d-type" value={f.discountType} onChange={(e) => setF({ ...f, discountType: e.target.value as "percentage" | "fixed" })}>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed amount (₹)</option>
              </NativeSelect>
            </div>
            <div className="space-y-1"><Label htmlFor="d-value">Value *</Label><Input id="d-value" required type="number" min={0.01} step="0.01" max={f.discountType === "percentage" ? 100 : undefined} value={f.discountValue} onChange={(e) => setF({ ...f, discountValue: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="d-code">Code (optional)</Label><Input id="d-code" maxLength={50} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="PARTY20" /></div>
            <div className="space-y-1"><Label htmlFor="d-venue">Applicable venue</Label><Input id="d-venue" maxLength={300} value={f.applicableVenue} onChange={(e) => setF({ ...f, applicableVenue: e.target.value })} placeholder="Any venue" /></div>
            <div className="space-y-1"><Label htmlFor="d-from">Valid from</Label><Input id="d-from" type="date" value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="d-until">Valid until</Label><Input id="d-until" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></div>
            <fieldset className="space-y-1.5 sm:col-span-2">
              <legend className="text-sm font-medium">Applicable categories (none = all)</legend>
              <div className="flex flex-wrap gap-3">
                {EVENT_CATEGORIES.map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={f.applicableCategories.includes(c)}
                      onCheckedChange={(checked) =>
                        setF({ ...f, applicableCategories: checked ? [...f.applicableCategories, c] : f.applicableCategories.filter((x) => x !== c) })
                      }
                    />
                    {CATEGORY_LABELS[c]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="d-desc">Description</Label><Textarea id="d-desc" rows={2} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="d-tc">Terms & conditions</Label><Textarea id="d-tc" rows={2} maxLength={3000} value={f.termsAndConditions} onChange={(e) => setF({ ...f, termsAndConditions: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={f.isActive} onCheckedChange={(c) => setF({ ...f, isActive: c })} /> Active</label>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save deal</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
