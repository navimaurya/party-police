"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, toastError } from "@/lib/api-client";
import { ALWAYS_SENT_NOTIFICATIONS, NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS, type NotificationType } from "@/types";

export type SettingsData = {
  notificationEnabled: boolean;
  notificationTypes?: Partial<Record<string, boolean>> | null;
  recipients: string[];
  reminderIntervals: number[];
  defaultReminderSettings?: { defaulterReminderEveryDays?: number; overdueNoticeAfterDays?: number; sendToEventParticipants?: boolean } | null;
  thankYou?: { includeBillLinks?: boolean; includePrivateBillLinks?: boolean; privateLinkTtlHours?: number } | null;
  currency: string;
  partyDay?: { sendAtHour?: number } | null;
};

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const save = async (patch: Record<string, unknown>, msg = "Settings saved ✅") => {
    setBusy(true);
    try {
      await api("/api/settings", { method: "PATCH", json: patch });
      toast.success(msg);
      router.refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

export function NotificationTypesForm({ settings }: { settings: SettingsData }) {
  const { busy, save } = useSave();
  const [master, setMaster] = useState(settings.notificationEnabled);
  const [types, setTypes] = useState<Record<NotificationType, boolean>>(
    Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, settings.notificationTypes?.[t] !== false])) as Record<NotificationType, boolean>
  );
  return (
    <Card>
      <CardHeader><CardTitle>📬 Email notification types</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
          <span><span className="font-medium">All notifications</span><span className="block text-xs text-muted-foreground">Master switch. When off, nothing is sent (queued jobs are skipped).</span></span>
          <Switch checked={master} onCheckedChange={setMaster} />
        </label>
        {NOTIFICATION_TYPES.filter((t) => !ALWAYS_SENT_NOTIFICATIONS.includes(t)).map((t) => (
          <label key={t} className={`flex items-center justify-between gap-3 text-sm ${!master ? "opacity-50" : ""}`}>
            {NOTIFICATION_TYPE_LABELS[t]}
            <Switch checked={types[t]} onCheckedChange={(c) => setTypes({ ...types, [t]: c })} />
          </label>
        ))}
        <Button disabled={busy} onClick={() => save({ notificationEnabled: master, notificationTypes: types })}>
          {busy && <Loader2 className="animate-spin" />} Save
        </Button>
      </CardContent>
    </Card>
  );
}

export function AppSettingsForm({ settings }: { settings: SettingsData }) {
  const { busy, save } = useSave();
  const [recipients, setRecipients] = useState(settings.recipients.join("\n"));
  const [intervals, setIntervals] = useState(settings.reminderIntervals.join(", "));
  const [every, setEvery] = useState(String(settings.defaultReminderSettings?.defaulterReminderEveryDays ?? 7));
  const [overdueAfter, setOverdueAfter] = useState(String(settings.defaultReminderSettings?.overdueNoticeAfterDays ?? 1));
  const [toParticipants, setToParticipants] = useState(settings.defaultReminderSettings?.sendToEventParticipants !== false);
  const [billLinks, setBillLinks] = useState(settings.thankYou?.includeBillLinks !== false);
  const [privateLinks, setPrivateLinks] = useState(settings.thankYou?.includePrivateBillLinks === true);
  const [ttl, setTtl] = useState(String(settings.thankYou?.privateLinkTtlHours ?? 72));
  const [currency, setCurrency] = useState(settings.currency || "INR");
  const [sendAtHour, setSendAtHour] = useState(String(settings.partyDay?.sendAtHour ?? 9));

  const submit = () => {
    const list = recipients.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const ints = intervals.split(/[\s,]+/).map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0);
    void save({
      recipients: list,
      reminderIntervals: ints,
      defaultReminderSettings: { defaulterReminderEveryDays: Number(every), overdueNoticeAfterDays: Number(overdueAfter), sendToEventParticipants: toParticipants },
      thankYou: { includeBillLinks: billLinks, includePrivateBillLinks: privateLinks, privateLinkTtlHours: Number(ttl) },
      currency,
      partyDay: { sendAtHour: Number(sendAtHour) },
    });
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <Card>
        <CardHeader><CardTitle>👥 Extra recipients</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">All <strong>active party members</strong> already get party emails. Add anyone else here, like a team mailing list.</p>
          <Label htmlFor="recipients">Extra email addresses (one per line)</Label>
          <Textarea id="recipients" rows={5} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder={"team@example.com\npriya@example.com"} />
          <label className="flex items-center gap-2 text-sm"><Switch checked={toParticipants} onCheckedChange={setToParticipants} /> Also email each party&apos;s participants and organizer</label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>🎉 Party-day emails</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">On every party day: all members get “today we will have a party”, the party giver gets their own email, and the Super Admin gets an approval request in the same thread.</p>
          <div className="max-w-48 space-y-1">
            <Label htmlFor="sendAtHour">Send at</Label>
            <select id="sendAtHour" className="h-9 w-full rounded-lg border bg-background px-2 text-sm" value={sendAtHour} onChange={(e) => setSendAtHour(e.target.value)}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Team timezone (APP_TIMEZONE).</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>⏰ Reminders</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="intervals">Upcoming reminders (hours before)</Label><Input id="intervals" value={intervals} onChange={(e) => setIntervals(e.target.value)} placeholder="24, 2" /></div>
          <div className="space-y-1"><Label htmlFor="every">Defaulter reminder every (days)</Label><Input id="every" type="number" min={1} max={90} value={every} onChange={(e) => setEvery(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="overdue">Public overdue notice after (days)</Label><Input id="overdue" type="number" min={0} max={90} value={overdueAfter} onChange={(e) => setOverdueAfter(e.target.value)} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>💌 Thank-you emails</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm"><Switch checked={billLinks} onCheckedChange={setBillLinks} /> Include links to public bills</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={privateLinks} onCheckedChange={setPrivateLinks} /> Also include <strong>private</strong> bills as expiring signed links</label>
          <div className="max-w-48 space-y-1"><Label htmlFor="ttl">Private link lifetime (hours)</Label><Input id="ttl" type="number" min={1} max={168} value={ttl} onChange={(e) => setTtl(e.target.value)} disabled={!privateLinks} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>🌏 General</CardTitle></CardHeader>
        <CardContent className="max-w-48 space-y-1">
          <Label htmlFor="currency">Default currency</Label>
          <Input id="currency" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </CardContent>
      </Card>
      <Button type="submit" size="lg" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save settings</Button>
    </form>
  );
}

export function TestEmailForm() {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader><CardTitle>🧪 Test SMTP</CardTitle></CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api("/api/notifications/test", { method: "POST", json: { to } });
              toast.success(`Test email sent to ${to} 📨`);
            } catch (err) {
              toastError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" aria-label="Test recipient" />
          <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Send test</Button>
        </form>
      </CardContent>
    </Card>
  );
}
