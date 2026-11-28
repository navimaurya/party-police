import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Committee Login", robots: { index: false } };

export default function LoginPage() {
  return (
    <main className="bg-party flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-50 via-white to-amber-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-3xl border bg-card p-8 shadow-lg">
        <div className="space-y-2 text-center">
          <Image src="/assets/logo/party-police.svg" alt="" width={56} height={56} className="mx-auto" priority />
          <h1 className="text-2xl font-bold">Party Committee HQ</h1>
          <p className="text-sm text-muted-foreground">Sign in with your email and password. Party defaulters, turn back now. 🚨</p>
        </div>
        {/* Suspense: the form reads ?reset=1 (shown after a password reset). */}
        <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-muted" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
