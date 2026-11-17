import Link from "next/link";
import { connection } from "next/server";
import { getAdmin } from "@/lib/auth";
import { UserAvatar } from "@/components/admin/user-badges";
import { ROLE_LABELS } from "@/types";

/** Signed-in user card at the bottom of the admin sidebar. Rendered on the server. */
export async function SidebarAccount() {
  // Request-time data (session + DB): never prerendered.
  await connection();
  const me = await getAdmin();
  if (!me) return null;
  return (
    <Link href="/admin/profile" className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-sidebar-accent" title="My profile">
      <UserAvatar name={me.name} email={me.email} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{me.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{ROLE_LABELS[me.role]}</span>
      </span>
    </Link>
  );
}

export function SidebarAccountSkeleton() {
  return (
    <div className="flex items-center gap-3 px-2 py-2">
      <span className="size-8 animate-pulse rounded-full bg-muted" />
      <span className="h-4 w-24 animate-pulse rounded bg-muted" />
    </div>
  );
}
