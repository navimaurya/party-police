"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  CalendarDays,
  CalendarHeart,
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
  { href: "/admin/occasions", label: "Occasions", icon: CalendarHeart },
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

/** Pages each role can open (the server enforces the same rules on every page and API). */
const MEMBER_NAV = new Set(["/admin/parties", "/admin/calendar", "/admin/occasions"]);
const MANAGER_NAV = new Set([...MEMBER_NAV, "/admin/monthly", "/admin/special", "/admin/occasional"]);
export type NavRole = "super_admin" | "admin" | "manager" | "member";

function visibleNav(role: NavRole) {
  if (role === "super_admin" || role === "admin") return NAV;
  const allowed = role === "manager" ? MANAGER_NAV : MEMBER_NAV;
  return NAV.filter((n) => allowed.has(n.href)).map((n) => (role === "member" && n.href === "/admin/parties" ? { ...n, label: "My Parties" } : n));
}

/** Navigation for the signed-in user's role. */
export function NavLinks({ role }: { role: NavRole }) {
  return (
    <Suspense fallback={<NavLinksView pathname={null} role={role} />}>
      <ActiveNavLinks role={role} />
    </Suspense>
  );
}

export function NavLinksSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-1" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => <span key={i} className="h-7 animate-pulse rounded-lg bg-muted" />)}
    </div>
  );
}

function ActiveNavLinks({ role }: { role: NavRole }) {
  return <NavLinksView pathname={usePathname()} role={role} />;
}

function NavLinksView({ pathname, role }: { pathname: string | null; role: NavRole }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Admin">
      {visibleNav(role).map(({ href, label, icon: Icon, exact }) => {
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

export function AdminSidebar({ account, nav }: { account?: React.ReactNode; nav: React.ReactNode }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
      <Link href="/admin/dashboard" className="flex h-14 items-center gap-2 border-b px-5 font-heading text-lg font-bold">
        🚨 Party HQ
      </Link>
      <div className="flex-1 overflow-y-auto p-3">{nav}</div>
      <div className="border-t p-3 space-y-1">
        {account}
        <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent"><ClipboardList className="size-4" /> View public site</Link>
        <LogoutButton />
      </div>
    </aside>
  );
}

export function AdminMobileNav({ account, nav }: { account?: React.ReactNode; nav: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
      <Link href="/admin/dashboard" className="font-heading text-lg font-bold">🚨 Party HQ</Link>
      <Sheet>
        <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open admin menu" />}>
          <Menu />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 overflow-y-auto">
          <SheetHeader><SheetTitle>🚨 Party HQ</SheetTitle></SheetHeader>
          <div className="px-3 pb-4">{nav}<div className="mt-3 space-y-1 border-t pt-3">{account}<LogoutButton /></div></div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
