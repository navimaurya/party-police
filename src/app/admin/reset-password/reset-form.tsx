"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewPasswordFields } from "@/components/admin/profile-forms";
import { api, ApiClientError } from "@/lib/api-client";
import { meetsPasswordPolicy } from "@/lib/password-policy";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [v, setV] = useState({ password: "", confirm: "" });
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const ready = meetsPasswordPolicy(v.password) && v.password === v.confirm;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        setPending(true);
        setError(null);
        try {
          await api("/api/auth/reset-password", { method: "POST", json: { token, newPassword: v.password } });
          router.replace("/admin/login?reset=1");
        } catch (err) {
          const expired = err instanceof ApiClientError && (err.details as { code?: string } | undefined)?.code === "RESET_LINK_INVALID";
          const field = err instanceof ApiClientError ? (err.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors?.newPassword?.[0] : undefined;
          setError({ message: field ?? (err instanceof ApiClientError ? err.message : "Something went wrong. Try again."), expired });
          setPending(false);
        }
      }}
    >
      <NewPasswordFields value={v.password} confirm={v.confirm} onChange={(password, confirm) => setV({ password, confirm })} />
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {error.message} {error.expired && <Link href="/admin/forgot-password" className="font-semibold underline">Request a new link</Link>}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={pending || !ready}>{pending && <Loader2 className="animate-spin" />} Set new password</Button>
    </form>
  );
}
