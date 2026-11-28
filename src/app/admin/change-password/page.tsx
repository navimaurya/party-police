import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/admin/profile-forms";
import { HOME_PATH, requireUserPage } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose your password", robots: { index: false } };

/**
 * Users who signed in with a one-time password (set by the Super Admin or emailed to them)
 * land here and can't open any other page until they choose their own password.
 */
export default function ChangePasswordPage() {
  return (
    <main className="bg-party flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-50 via-white to-amber-50 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <Image src="/assets/logo/party-police.svg" alt="" width={56} height={56} className="mx-auto" priority />
          <h1 className="text-2xl font-bold">Choose your own password</h1>
          <Suspense fallback={<p className="mx-auto h-10 max-w-xs animate-pulse rounded bg-muted" />}>
            <Greeting />
          </Suspense>
        </div>
        <ChangePasswordForm redirectTo={HOME_PATH} requireCurrent={false} />
      </div>
    </main>
  );
}

/** Request-time: checks the session and that a password change is actually pending. */
async function Greeting() {
  const user = await requireUserPage({ allowPasswordChange: true });
  if (!user.mustChangePassword) redirect("/admin/profile");
  return (
    <p className="text-sm text-muted-foreground">
      Hi {user.name.split(/\s+/)[0]}! You signed in with a one-time password. You&apos;re signed in, so there&apos;s no need to type it again. Just choose your new password to continue.
    </p>
  );
}
