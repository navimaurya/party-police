"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, toastError } from "@/lib/api-client";
import { CATEGORY_EMOJI, CATEGORY_LABELS, EVENT_CATEGORIES, type EventCategory } from "@/types";

type Row = { category: EventCategory; minimumBudget: string; maximumBudget: string; noMinimum: boolean; noMaximum: boolean; isEnabled: boolean; currency: string };
type Existing = { category: EventCategory; minimumBudget?: number | null; maximumBudget?: number | null; noMinimum: boolean; noMaximum: boolean; isEnabled: boolean; currency: string };

export function BudgetForm({ validationEnabled, categories }: { validationEnabled: boolean; categories: Existing[] }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(validationEnabled);
  const [rows, setRows] = useState<Row[]>(
    EVENT_CATEGORIES.map((c) => {
      const e = categories.find((x) => x.category === c);
      return {
        category: c,
        minimumBudget: e?.minimumBudget != null ? String(e.minimumBudget) : "",
        maximumBudget: e?.maximumBudget != null ? String(e.maximumBudget) : "",
        noMinimum: e?.noMinimum ?? false,
        noMaximum: e?.noMaximum ?? false,
        isEnabled: e?.isEnabled ?? false,
        currency: e?.currency ?? "INR",
      };
    })
  );
  const [busy, setBusy] = useState(false);
  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  async function save() {
    setBusy(true);
    try {
      await api("/api/budgets", {
        method: "PATCH",
        json: {
          validationEnabled: enabled,
          categories: rows.map((r) => ({
            category: r.category,
            minimumBudget: r.noMinimum || r.minimumBudget === "" ? null : Number(r.minimumBudget),
            maximumBudget: r.noMaximum || r.maximumBudget === "" ? null : Number(r.maximumBudget),
            noMinimum: r.noMinimum,
            noMaximum: r.noMaximum,
            isEnabled: r.isEnabled,
            currency: r.currency,
          })),
        },
      });
      toast.success("Budget settings saved. Existing parties are untouched. 💰");
      router.refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <Card>
        <CardContent>
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="font-medium">Budget validation</span>
              <span className="block text-sm text-muted-foreground">When off, any budget is accepted for every category.</span>
            </span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </label>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        {rows.map((r, i) => (
          <Card key={r.category} className={!enabled || !r.isEnabled ? "opacity-70" : ""}>
            <CardHeader><CardTitle>{CATEGORY_EMOJI[r.category]} {CATEGORY_LABELS[r.category]}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center justify-between text-sm">Enforce limits <Switch checked={r.isEnabled} onCheckedChange={(c) => update(i, { isEnabled: c })} /></label>
              <div className="space-y-1">
                <Label htmlFor={`min-${r.category}`}>Minimum (₹)</Label>
                <Input id={`min-${r.category}`} type="number" min={1} disabled={r.noMinimum} required={r.isEnabled && !r.noMinimum} value={r.minimumBudget} onChange={(e) => update(i, { minimumBudget: e.target.value })} />
                <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch size="sm" checked={r.noMinimum} onCheckedChange={(c) => update(i, { noMinimum: c })} /> No minimum</label>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`max-${r.category}`}>Maximum (₹)</Label>
                <Input id={`max-${r.category}`} type="number" min={1} disabled={r.noMaximum} required={r.isEnabled && !r.noMaximum} value={r.maximumBudget} onChange={(e) => update(i, { maximumBudget: e.target.value })} />
                <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch size="sm" checked={r.noMaximum} onCheckedChange={(c) => update(i, { noMaximum: c })} /> Unlimited</label>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button type="submit" size="lg" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save budget settings</Button>
    </form>
  );
}
