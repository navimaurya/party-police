import type { Metadata } from "next";
import Image from "next/image";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <main className="bg-party flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-50 via-white to-amber-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-3xl border bg-card p-8 shadow-lg">
        <div className="space-y-2 text-center">
          <Image src="/assets/logo/party-police.svg" alt="" width={56} height={56} className="mx-auto" priority />
          <h1 className="text-2xl font-bold">Forgot your password?</h1>
          <p className="text-sm text-muted-foreground">Enter your email and we&apos;ll send you a link to choose a new one. Happens to the best of us. 🤷</p>
        </div>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
