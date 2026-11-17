import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-center text-sm text-muted-foreground sm:flex-row sm:text-left">
        <p>We don&apos;t forget parties. We don&apos;t forgive party debts. We are the Party Committee! 🎉</p>
        <Link href="/admin/login" className="text-xs hover:text-foreground">Committee login</Link>
      </div>
    </footer>
  );
}
