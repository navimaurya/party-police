"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, toastError } from "@/lib/api-client";
import { toDateInput } from "@/lib/format";
import { OccasionsEditor, occasionsToPayload, toOccasionRows } from "@/components/admin/occasions-editor";

export type ProfileData = {
  name: string;
  phone?: string;
  department?: string;
  designation?: string;
  birthday?: string | null;
  joinedOn?: string | null;
  occasions?: { personName: string; relation: string; occasion: string; label?: string; date: string }[];
};

export function ProfileForm({ profile }: { profile: ProfileData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({
    name: profile.name,
    phone: profile.phone ?? "",
    department: profile.department ?? "",
    designation: profile.designation ?? "",
    birthday: toDateInput(profile.birthday),
    joinedOn: toDateInput(profile.joinedOn),
  });
  const [occasions, setOccasions] = useState(() => toOccasionRows(profile.occasions));
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal details</CardTitle>
        <CardDescription>How you appear to the team and in party emails.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api("/api/profile", {
                method: "PATCH",
                json: {
                  ...v,
                  birthday: v.birthday ? new Date(`${v.birthday}T00:00:00`).toISOString() : null,
                  joinedOn: v.joinedOn ? new Date(`${v.joinedOn}T00:00:00`).toISOString() : null,
                  occasions: occasionsToPayload(occasions),
                },
              });
              toast.success("Profile saved");
              router.refresh();
            } catch (err) {
              toastError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="p-name">Full name</Label><Input id="p-name" required maxLength={100} value={v.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="p-phone">Phone</Label><Input id="p-phone" type="tel" maxLength={30} value={v.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="p-designation">Designation</Label><Input id="p-designation" maxLength={100} value={v.designation} onChange={(e) => set("designation", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="p-department">Department</Label><Input id="p-department" maxLength={100} value={v.department} onChange={(e) => set("department", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="p-joined">Joined on</Label><Input id="p-joined" type="date" value={v.joinedOn} onChange={(e) => set("joinedOn", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="p-birthday">Birthday</Label><Input id="p-birthday" type="date" value={v.birthday} onChange={(e) => set("birthday", e.target.value)} /></div>
          <div className="sm:col-span-2">
            <OccasionsEditor value={occasions} onChange={setOccasions} title="My family's events" />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save changes</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** `redirectTo`: where to go after a successful change (the forced one-time-password flow). */
export function ChangePasswordForm({ redirectTo, currentLabel = "Current password" }: { redirectTo?: string; currentLabel?: string } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const mismatch = v.confirm.length > 0 && v.newPassword !== v.confirm;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Changing it signs you out on all other devices.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (mismatch) return;
            setBusy(true);
            try {
              await api("/api/profile/password", { method: "POST", json: { currentPassword: v.currentPassword, newPassword: v.newPassword } });
              toast.success("Password changed. Other sessions were signed out.");
              setV({ currentPassword: "", newPassword: "", confirm: "" });
              if (redirectTo) {
                router.replace(redirectTo);
                router.refresh();
              }
            } catch (err) {
              toastError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5"><Label htmlFor="cp-current">{currentLabel}</Label><Input id="cp-current" type="password" required autoComplete="current-password" value={v.currentPassword} onChange={(e) => setV({ ...v, currentPassword: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cp-new">New password</Label><Input id="cp-new" type="password" required minLength={10} maxLength={200} autoComplete="new-password" value={v.newPassword} onChange={(e) => setV({ ...v, newPassword: e.target.value })} /><p className="text-xs text-muted-foreground">At least 10 characters.</p></div>
          <div className="space-y-1.5"><Label htmlFor="cp-confirm">Confirm new password</Label><Input id="cp-confirm" type="password" required minLength={10} maxLength={200} autoComplete="new-password" aria-invalid={mismatch} value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} />{mismatch && <p className="text-xs text-destructive">Passwords don&apos;t match.</p>}</div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || mismatch}>{busy && <Loader2 className="animate-spin" />} Update password</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
