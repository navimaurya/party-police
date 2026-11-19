import type { Metadata } from "next";
import { CalendarCog, ShieldCheck, UserCheck, UserRound, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { UsersManager } from "@/components/admin/users-manager";
import { requireAdminPage } from "@/lib/auth";
import { serialize } from "@/lib/utils-server";
import { UserListQuerySchema } from "@/lib/validation";
import { listUsers } from "@/services/user.service";
import { USER_ROLES } from "@/types";

export const metadata: Metadata = { title: "Users" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export default async function UsersPage(props: PageProps<"/admin/users">) {
  const admin = await requireAdminPage();
  const sp = await props.searchParams;
  const role = USER_ROLES.find((r) => r === sp.role);
  const status = sp.status === "active" || sp.status === "inactive" ? sp.status : undefined;
  const q = UserListQuerySchema.parse({ q: str(sp.q), role, status, page: str(sp.page) ?? 1, sort: str(sp.sort) });
  const { items, total, summary, sort } = await listUsers(q);

  const stats = [
    { label: "Total users", value: summary.total, icon: Users, tone: "bg-pink-100 text-pink-700" },
    { label: "Active", value: summary.active, icon: UserCheck, tone: "bg-emerald-100 text-emerald-700" },
    { label: "Admins", value: summary.admins, icon: ShieldCheck, tone: "bg-violet-100 text-violet-700" },
    { label: "Managers", value: summary.managers, icon: CalendarCog, tone: "bg-sky-100 text-sky-700" },
    { label: "Members", value: summary.members, icon: UserRound, tone: "bg-slate-100 text-slate-700" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle="Everyone on the team. Active users receive party emails, can be party givers and sign in with their email and password." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} size="sm">
            <CardContent className="flex items-center gap-3">
              <span className={`flex size-9 items-center justify-center rounded-lg ${tone}`}><Icon className="size-4" /></span>
              <div>
                <p className="text-xl font-semibold tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <UsersManager
        items={serialize(items)}
        total={total}
        page={q.page}
        limit={q.limit}
        viewer={{ id: admin.id, role: admin.role }}
        filters={{ q: q.q, role: q.role, status: q.status }}
        sort={sort}
      />
    </div>
  );
}
