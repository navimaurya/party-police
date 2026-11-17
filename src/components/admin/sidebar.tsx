"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  CalendarDays,
  Cake,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PartyPopper,
  Pizza,
  ScrollText,
  Settings,
  Skull,
  Sparkles,
  Tag,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/parties", label: "Party Management", icon: PartyPopper, exact: true },
  { href: "/admin/monthly", label: "Monthly Parties", icon: Pizza },
  { href: "/admin/special", label: "Special Personal Events", icon: Cake },
  { href: "/admin/occasional", label: "Occasional Parties", icon: Sparkles },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/defaulters", label: "Party Defaulters", icon: Skull },
  { href: "/admin/legends", label: "Party Legends", icon: Trophy },
  { href: "/admin/discounts", label: "Discount Management", icon: Tag },
  { href: "/admin/budgets", label: "Budget Settings", icon: Wallet },
  { href: "/admin/bills", label: "Bills & Attachments", icon: FileText },
  { href: "/admin/notifications", label: "Email Notifications", icon: Bell, exact: true },
  { href: "/admin/notifications/logs", label: "Notification Logs", icon: ScrollText },
  { href: "/admin/settings", label: "Application Settings", icon: Settings },
  { href: "/admin/audit", label: "Audit Log", icon: History },
];

function NavLinks() {
  return (
    <Suspense fallback={<NavLinksView pathname={null} />}>
      <ActiveNavLinks />
    </Suspense>
  );
}

function ActiveNavLinks() {
  return <NavLinksView pathname={usePathname()} />;
}

function NavLinksView({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Admin">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active =
          pathname !== null &&
          (exact ? pathname === href || (href === "/admin/parties" && /^\/admin\/parties\/(new|[a-f\d]{24})/.test(pathname)) : pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      className="w-full justify-start"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        router.replace("/admin/login");
        router.refresh();
      }}
    >
      <LogOut /> Log out
    </Button>
  );
}

export function AdminSidebar({ account }: { account?: React.ReactNode }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
      <Link href="/admin/dashboard" className="flex h-14 items-center gap-2 border-b px-5 font-heading text-lg font-bold">
        🚨 Party HQ
      </Link>
      <div className="flex-1 overflow-y-auto p-3"><NavLinks /></div>
      <div className="border-t p-3 space-y-1">
        {account}
        <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent"><ClipboardList className="size-4" /> View public site</Link>
        <LogoutButton />
      </div>
    </aside>
  );
}

export function AdminMobileNav({ account }: { account?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
      <Link href="/admin/dashboard" className="font-heading text-lg font-bold">🚨 Party HQ</Link>
      <Sheet>
        <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open admin menu" />}>
          <Menu />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 overflow-y-auto">
          <SheetHeader><SheetTitle>🚨 Party HQ</SheetTitle></SheetHeader>
          <div className="px-3 pb-4"><NavLinks /><div className="mt-3 space-y-1 border-t pt-3">{account}<LogoutButton /></div></div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
