"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/parties", label: "Parties" },
  { href: "/calendar", label: "Calendar" },
  { href: "/hall-of-shame", label: "Hall of Shame" },
  { href: "/discounts", label: "Deals" },
];

function NavItems({ pathname, mobile = false }: { pathname: string | null; mobile?: boolean }) {
  const isActive = (href: string) => pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <>
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={isActive(n.href) ? "page" : undefined}
          className={cn(
            mobile ? "rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted" : "rounded-full px-3 py-1.5 text-sm font-medium transition hover:bg-muted",
            isActive(n.href) && "bg-secondary text-secondary-foreground"
          )}
        >
          {n.label}
        </Link>
      ))}
    </>
  );
}

function ActiveNavItems({ mobile }: { mobile?: boolean }) {
  return <NavItems pathname={usePathname()} mobile={mobile} />;
}

/** usePathname is request data on dynamic routes, so the active state streams in behind Suspense. */
function Nav({ mobile = false }: { mobile?: boolean }) {
  return (
    <Suspense fallback={<NavItems pathname={null} mobile={mobile} />}>
      <ActiveNavItems mobile={mobile} />
    </Suspense>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold">
          <Image src="/assets/logo/party-police.svg" alt="" width={28} height={28} priority />
          Party Police <span aria-hidden>🚨</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          <Nav />
        </nav>
        <Sheet>
          <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" />}>
            <Menu />
          </SheetTrigger>
          <SheetContent side="right" className="w-64">
            <SheetHeader>
              <SheetTitle>🚨 Party Police</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4" aria-label="Mobile">
              <Nav mobile />
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
