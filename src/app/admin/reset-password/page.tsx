import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { checkPasswordResetToken } from "@/services/password.service";
import { ResetPasswordForm } from "./reset-form";

/** No referrer: the reset token is in this page's URL. */
export const metadata: Metadata = { title: "Choose a new password", robots: { index: false }, referrer: "no-referrer" };

export default function ResetPasswordPage(props: PageProps<"/admin/reset-password">) {
  return (
    <main className="bg-party flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-50 via-white to-amber-50 px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-3xl border bg-card p-8 shadow-lg">
        <div className="space-y-2 text-center">
          <Image src="/assets/logo/party-police.svg" alt="" width={56} height={56} className="mx-auto" priority />
          <h1 className="text-2xl font-bold">Choose a new password</h1>
        </div>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
          <ResetBody searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

/** Request-time: checks the link without using it up. */
async function ResetBody({ searchParams }: { searchParams: PageProps<"/admin/reset-password">["searchParams"] }) {
  await connection();
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const valid = await checkPasswordResetToken(token);
  if (!valid) {
    return (
      <div className="space-y-4 text-center text-sm">
        <p className="rounded-lg bg-amber-50 p-3 text-amber-900">⏰ This link is invalid, already used, or older than 30 minutes.</p>
        <Link href="/admin/forgot-password" className="font-semibold text-primary hover:underline">Request a new link</Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">For <strong className="text-foreground">{valid.email}</strong>. Setting it signs you out everywhere.</p>
      <ResetPasswordForm token={token} />
    </div>
  );
}
