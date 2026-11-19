"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/admin/native-select";
import { toDateInput } from "@/lib/format";
import { OCCASION_TYPES, RELATIONS, type OccasionType, type Relation } from "@/types";

/** One editable row. `date` is "yyyy-MM-dd"; `key` only exists on the client. */
export type OccasionRow = { key: string; personName: string; relation: Relation; occasion: OccasionType; label: string; date: string };

type Stored = { personName: string; relation: string; occasion: string; label?: string; date: string };

const newKey = () => Math.random().toString(36).slice(2, 10);

export function toOccasionRows(list: Stored[] | undefined | null): OccasionRow[] {
  return (list ?? []).map((o) => ({
    key: newKey(),
    personName: o.personName,
    relation: (RELATIONS as readonly string[]).includes(o.relation) ? (o.relation as Relation) : "Other",
    occasion: (OCCASION_TYPES as readonly string[]).includes(o.occasion) ? (o.occasion as OccasionType) : "Other",
    label: o.label ?? "",
    date: toDateInput(o.date),
  }));
}

/** Rows without a name or date are dropped. Dates are sent as local midnight, like birthdays. */
export function occasionsToPayload(rows: OccasionRow[]) {
  return rows
    .filter((r) => r.personName.trim() && r.date)
    .map((r) => ({
      personName: r.personName.trim(),
      relation: r.relation,
      occasion: r.occasion,
      label: r.occasion === "Other" ? r.label.trim() : "",
      date: new Date(`${r.date}T00:00:00`).toISOString(),
    }));
}

/**
 * Relatives' (and other) yearly occasions: person, relation, occasion, date.
 * "Add event" adds a row; nothing is saved until the surrounding form is saved.
 */
export function OccasionsEditor({ value, onChange, title = "Relatives' events" }: { value: OccasionRow[]; onChange: (rows: OccasionRow[]) => void; title?: string }) {
  const update = (key: string, patch: Partial<OccasionRow>) => onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => onChange([...value, { key: newKey(), personName: "", relation: "Spouse", occasion: "Birthday", label: "", date: "" }]);

  return (
    <fieldset className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</legend>
        <Button type="button" size="sm" variant="outline" onClick={add}><Plus /> Add event</Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          No events yet. Add a spouse&apos;s birthday, a wedding anniversary, a child&apos;s birthday… 🎂
        </p>
      ) : (
        <ul className="space-y-3">
          {value.map((r, i) => (
            <li key={r.key} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`oc-name-${r.key}`}>Person&apos;s name <span className="text-destructive">*</span></Label>
                <Input id={`oc-name-${r.key}`} required maxLength={100} value={r.personName} onChange={(e) => update(r.key, { personName: e.target.value })} placeholder="Priya" />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`oc-rel-${r.key}`}>Relation</Label>
                <NativeSelect id={`oc-rel-${r.key}`} value={r.relation} onChange={(e) => update(r.key, { relation: e.target.value as Relation })}>
                  {RELATIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`oc-type-${r.key}`}>Occasion</Label>
                <NativeSelect id={`oc-type-${r.key}`} value={r.occasion} onChange={(e) => update(r.key, { occasion: e.target.value as OccasionType })}>
                  {OCCASION_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`oc-date-${r.key}`}>Date <span className="text-destructive">*</span></Label>
                <Input id={`oc-date-${r.key}`} type="date" required value={r.date} onChange={(e) => update(r.key, { date: e.target.value })} />
              </div>
              {r.occasion === "Other" && (
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor={`oc-label-${r.key}`}>What is it?</Label>
                  <Input id={`oc-label-${r.key}`} maxLength={100} value={r.label} onChange={(e) => update(r.key, { label: e.target.value })} placeholder="Graduation day" />
                </div>
              )}
              <div className="flex justify-end sm:col-span-2">
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onChange(value.filter((x) => x.key !== r.key))} aria-label={`Remove event ${i + 1}`}>
                  <Trash2 /> Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
