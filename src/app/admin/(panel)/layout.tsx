import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminMobileNav, AdminSidebar } from "@/components/admin/sidebar";
import { NavLinksSkeleton } from "@/components/admin/sidebar";
import { SidebarAccount, SidebarAccountSkeleton, SidebarNav } from "@/components/admin/sidebar-account";
import { requireUserPage } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Party HQ" }, robots: { index: false } };

/**
 * Session is validated server-side before any panel content renders. Every role can enter
 * the panel; each page then checks the role it needs. One-time passwords go to change-password first.
 */
async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireUserPage();
  return <>{children}</>;
}

const nav = () => <Suspense fallback={<NavLinksSkeleton />}><SidebarNav /></Suspense>;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar nav={nav()} account={<Suspense fallback={<SidebarAccountSkeleton />}><SidebarAccount /></Suspense>} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminMobileNav nav={nav()} account={<Suspense fallback={<SidebarAccountSkeleton />}><SidebarAccount /></Suspense>} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <Suspense fallback={<div className="space-y-4"><div className="h-8 w-48 animate-pulse rounded bg-muted" /><div className="h-64 animate-pulse rounded-2xl bg-muted" /></div>}>
            <AdminGate>{children}</AdminGate>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
