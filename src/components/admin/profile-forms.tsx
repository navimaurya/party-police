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
import { PasswordStrength } from "@/components/shared/password-strength";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, meetsPasswordPolicy } from "@/lib/password-policy";

export type ProfileData = {
  name: string;
  phone?: string;
  department?: string;
  designation?: string;
  upiId?: string;
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
    upiId: profile.upiId ?? "",
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
          <div className="space-y-1.5"><Label htmlFor="p-upi">UPI ID</Label><Input id="p-upi" maxLength={100} autoComplete="off" placeholder="name@okhdfcbank" value={v.upiId} onChange={(e) => set("upiId", e.target.value.trim())} /><p className="text-xs text-muted-foreground">For contri parties you host: everyone gets a QR to pay you back.</p></div>
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

/**
 * `redirectTo`: where to go after a successful change (the forced one-time-password flow).
 * `requireCurrent={false}`: right after a one-time-password sign-in only the new password is asked.
 */
export function ChangePasswordForm({ redirectTo, requireCurrent = true }: { redirectTo?: string; requireCurrent?: boolean } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const mismatch = v.confirm.length > 0 && v.newPassword !== v.confirm;
  const weak = !meetsPasswordPolicy(v.newPassword);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{requireCurrent ? "Password" : "New password"}</CardTitle>
        <CardDescription>Changing it signs you out on all other devices.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (mismatch || weak) return;
            setBusy(true);
            try {
              await api("/api/profile/password", { method: "POST", json: { ...(requireCurrent ? { currentPassword: v.currentPassword } : {}), newPassword: v.newPassword } });
              toast.success(requireCurrent ? "Password changed. Other sessions were signed out." : "Password set. Welcome in! 🎉");
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
          {requireCurrent && (
            <div className="space-y-1.5"><Label htmlFor="cp-current">Current password</Label><Input id="cp-current" type="password" required autoComplete="current-password" value={v.currentPassword} onChange={(e) => setV({ ...v, currentPassword: e.target.value })} /></div>
          )}
          <NewPasswordFields value={v.newPassword} confirm={v.confirm} onChange={(newPassword, confirm) => setV({ ...v, newPassword, confirm })} />
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || mismatch || weak}>{busy && <Loader2 className="animate-spin" />} {requireCurrent ? "Update password" : "Set password & continue"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** "New password" + "Confirm" with the live strength meter and policy checklist. */
export function NewPasswordFields({ value, confirm, onChange }: { value: string; confirm: string; onChange: (value: string, confirm: string) => void }) {
  const mismatch = confirm.length > 0 && value !== confirm;
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="cp-new">New password</Label>
        <Input id="cp-new" type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" aria-describedby="cp-strength" value={value} onChange={(e) => onChange(e.target.value, confirm)} />
        <PasswordStrength id="cp-strength" password={value} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-confirm">Confirm new password</Label>
        <Input id="cp-confirm" type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" aria-invalid={mismatch} value={confirm} onChange={(e) => onChange(value, e.target.value)} />
        {mismatch && <p className="text-xs text-destructive">Passwords don&apos;t match.</p>}
      </div>
    </>
  );
}
