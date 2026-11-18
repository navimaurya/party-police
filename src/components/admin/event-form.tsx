"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/admin/native-select";
import { ParticipantPicker, type Participant } from "@/components/admin/participant-picker";
import { api, ApiClientError, toastError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { EventFormValue } from "@/components/admin/event-form-value";
import {
  CATEGORY_LABELS,
  EVENT_CATEGORIES,
  OCCASIONAL_OCCASIONS,
  SPECIAL_OCCASIONS,
  type EventCategory,
  type EventStatus,
} from "@/types";


type BudgetRule = { category: EventCategory; minimumBudget?: number | null; maximumBudget?: number | null; noMinimum: boolean; noMaximum: boolean; isEnabled: boolean };

const PREF_LABELS = {
  reminders: "Upcoming reminders",
  announcement: "Instant announcement",
  updates: "Update & cancellation emails",
  thankYou: "Thank-you email after completion",
  includeBillLinks: "Include bill links in thank-you",
} as const;

export type MemberOption = { name: string; email: string; role?: string };

export function EventForm({
  initial,
  budgetRules,
  validationEnabled,
  members = [],
}: {
  initial: EventFormValue;
  budgetRules: BudgetRule[];
  validationEnabled: boolean;
  members?: MemberOption[];
}) {
  const router = useRouter();
  const isEdit = !!initial._id;
  const [v, setV] = useState<EventFormValue>(initial);
  const [participants, setParticipants] = useState<Participant[]>(initial.participants);
  const [pending, setPending] = useState(false);
  const [override, setOverride] = useState<{ open: boolean; message: string; reason: string }>({ open: false, message: "", reason: "" });
  const prefs = { reminders: true, announcement: true, updates: true, thankYou: true, includeBillLinks: true, ...(v.notificationPreferences ?? {}) };
  const set = <K extends keyof EventFormValue>(k: K, val: EventFormValue[K]) => setV((s) => ({ ...s, [k]: val }));

  const rule = budgetRules.find((r) => r.category === v.category);
  const rangeHint = useMemo(() => {
    if (!validationEnabled || !rule || !rule.isEnabled) return "No budget limits for this category.";
    const min = rule.noMinimum ? "no minimum" : formatMoney(rule.minimumBudget);
    const max = rule.noMaximum ? "unlimited" : formatMoney(rule.maximumBudget);
    return `Allowed range: ${min} – ${max}`;
  }, [rule, validationEnabled]);

  const giver = members.find((m) => m.email === (v.organizerEmail ?? "").toLowerCase());
  const pickGiver = (email: string) => {
    const m = members.find((x) => x.email === email);
    if (m) setV((s) => ({ ...s, organizerName: m.name, organizerEmail: m.email }));
    else setV((s) => ({ ...s, organizerName: "", organizerEmail: "" }));
  };

  const occasions = v.category === "special" ? SPECIAL_OCCASIONS : v.category === "occasional" ? OCCASIONAL_OCCASIONS : ["Monthly treat", "Team lunch", "Monthly celebration"];

  async function submit(budgetOverride?: { reason: string }) {
    setPending(true);
    const payload: Record<string, unknown> = {
      title: v.title,
      eventType: v.eventType,
      category: v.category,
      organizerName: v.organizerName,
      organizerEmail: v.organizerEmail || "",
      occasion: v.occasion ?? "",
      description: v.description ?? "",
      location: v.location ?? "",
      participants: participants.map((p) => ({ name: p.name, email: p.email || "" })),
      budget: v.budget ?? null,
      currency: v.currency || "INR",
      status: v.status,
      publicVisibility: v.publicVisibility,
      notificationPreferences: prefs,
      ...(budgetOverride ? { budgetOverride } : {}),
    };
    // Only send the date when it changed, so a no-op edit can't trigger an "updated" email.
    if (v.eventDate && (!isEdit || v.eventDate !== initial.eventDate)) payload.eventDate = new Date(v.eventDate).toISOString();
    try {
      const saved = await api<{ _id: string }>(isEdit ? `/api/events/${initial._id}` : "/api/events", {
        method: isEdit ? "PATCH" : "POST",
        json: payload,
      });
      toast.success(isEdit ? "Party updated ✨" : v.eventType === "instant" ? "🚨 Breaking news published!" : "Party scheduled! 🎉");
      setOverride({ open: false, message: "", reason: "" });
      if (isEdit) router.refresh();
      else router.push(`/admin/parties/${saved._id}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "BUDGET_OUT_OF_RANGE") {
        setOverride({ open: true, message: err.message, reason: override.reason });
      } else {
        toastError(err);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="inline-flex rounded-xl border p-1" role="radiogroup" aria-label="Party type">
        {(["scheduled", "instant"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={v.eventType === t}
            onClick={() => set("eventType", t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${v.eventType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {t === "scheduled" ? "📅 Scheduled party" : "🚨 Instant party"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="title">Title *</Label>
          <Input id="title" required maxLength={200} value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Ravi's Promotion Pizza Party 🍕" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <NativeSelect id="category" value={v.category} onChange={(e) => set("category", e.target.value as EventCategory)}>
            {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="occasion">Occasion</Label>
          <Input id="occasion" list="occasions" maxLength={200} value={v.occasion ?? ""} onChange={(e) => set("occasion", e.target.value)} placeholder="Promotion, Birthday, Festival…" />
          <datalist id="occasions">{occasions.map((o) => <option key={o} value={o} />)}</datalist>
        </div>
        {members.length > 0 && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="giver">Party giver (who&apos;s paying 💸)</Label>
            <NativeSelect id="giver" value={giver?.email ?? ""} onChange={(e) => pickGiver(e.target.value)}>
              <option value="">— Not a user (type the name below) —</option>
              {members.map((m) => <option key={m.email} value={m.email}>{m.name} · {m.email}{m.role && m.role !== "Member" ? ` (${m.role})` : ""}</option>)}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">On the party day at 9 AM the giver gets their own email, and the Super Admin is asked to confirm in the same thread.</p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="organizer">Organizer name *</Label>
          <Input id="organizer" required maxLength={100} value={v.organizerName} onChange={(e) => set("organizerName", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="organizerEmail">Organizer email (for the party-day and thank-you emails)</Label>
          <Input id="organizerEmail" type="email" value={v.organizerEmail ?? ""} onChange={(e) => set("organizerEmail", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date">{v.eventType === "instant" ? "When (defaults to now)" : "Date & time *"}</Label>
          <Input id="date" type="datetime-local" required={v.eventType === "scheduled"} value={v.eventDate ?? ""} onChange={(e) => set("eventDate", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location">Venue / location</Label>
          <Input id="location" maxLength={300} value={v.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="Pizza Palace, 3rd floor pantry…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budget">Budget (₹)</Label>
          <Input
            id="budget"
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            value={v.budget ?? ""}
            onChange={(e) => set("budget", e.target.value === "" ? null : Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">{rangeHint}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <NativeSelect id="status" value={v.status} onChange={(e) => set("status", e.target.value as EventStatus)}>
            <option value="upcoming">Upcoming</option>
            {(!isEdit || initial.status === "completed") && <option value="completed">Completed (approved: party was given)</option>}
            <option value="cancelled">Cancelled</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={3} maxLength={5000} value={v.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Menu, dress code, threats…" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="participants">Participants</Label>
          <ParticipantPicker id="participants" users={members} value={participants} onChange={setParticipants} />
        </div>
      </div>

      <fieldset className="space-y-3 rounded-2xl border p-4">
        <legend className="px-1 text-sm font-semibold">Visibility & notifications</legend>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>🌍 Show on the public website</span>
          <Switch checked={v.publicVisibility} onCheckedChange={(c) => set("publicVisibility", c)} />
        </label>
        {(Object.keys(PREF_LABELS) as (keyof typeof PREF_LABELS)[]).map((k) => (
          <label key={k} className="flex items-center justify-between gap-3 text-sm">
            <span>{PREF_LABELS[k]}</span>
            <Switch checked={prefs[k]} onCheckedChange={(c) => set("notificationPreferences", { ...prefs, [k]: c })} />
          </label>
        ))}
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} {isEdit ? "Save changes" : v.eventType === "instant" ? "🚨 Announce now" : "Schedule party"}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => router.back()}>Cancel</Button>
      </div>

      <Dialog open={override.open} onOpenChange={(open) => setOverride((o) => ({ ...o, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Budget out of range 💸</DialogTitle>
            <DialogDescription>{override.message} As Super Admin you can override this. The override is recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="override-reason">Reason (optional)</Label>
            <Textarea id="override-reason" maxLength={500} value={override.reason} onChange={(e) => setOverride((o) => ({ ...o, reason: e.target.value }))} placeholder="Biryani for 40 people. Worth it." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverride((o) => ({ ...o, open: false }))}>Change budget</Button>
            <Button disabled={pending} onClick={() => void submit({ reason: override.reason })}>
              {pending && <Loader2 className="animate-spin" />} Override & save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
