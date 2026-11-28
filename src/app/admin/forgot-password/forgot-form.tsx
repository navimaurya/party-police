"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiClientError } from "@/lib/api-client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (sent) {
    return (
      <div className="space-y-4 text-sm">
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">
          📬 If <strong>{email}</strong> has a Party Police account, a reset link is on its way. It works once, for <strong>30 minutes</strong>.
        </p>
        <p className="text-muted-foreground">Nothing after a few minutes? Check spam, or ask the Super Admin.</p>
        <Link href="/admin/login" className="block text-center text-primary hover:underline">← Back to sign in</Link>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          await api("/api/auth/forgot-password", { method: "POST", json: { email } });
          setSent(true);
        } catch (err) {
          setError(err instanceof ApiClientError ? err.message : "Something went wrong. Try again.");
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="username" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Email me a reset link</Button>
      <Link href="/admin/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">← Back to sign in</Link>
    </form>
  );
}
