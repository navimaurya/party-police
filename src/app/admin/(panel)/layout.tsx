import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminMobileNav, AdminSidebar } from "@/components/admin/sidebar";
import { SidebarAccount, SidebarAccountSkeleton } from "@/components/admin/sidebar-account";
import { requireAdminPage } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Party HQ" }, robots: { index: false } };

/** Session is validated server-side before any admin content renders. */
async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar account={<Suspense fallback={<SidebarAccountSkeleton />}><SidebarAccount /></Suspense>} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminMobileNav account={<Suspense fallback={<SidebarAccountSkeleton />}><SidebarAccount /></Suspense>} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <Suspense fallback={<div className="space-y-4"><div className="h-8 w-48 animate-pulse rounded bg-muted" /><div className="h-64 animate-pulse rounded-2xl bg-muted" /></div>}>
            <AdminGate>{children}</AdminGate>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
