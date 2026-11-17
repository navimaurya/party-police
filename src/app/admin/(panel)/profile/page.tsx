import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { ChangePasswordForm, ProfileForm } from "@/components/admin/profile-forms";
import { RoleBadge, UserAvatar } from "@/components/admin/user-badges";
import { requireAdminPage } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { serialize } from "@/lib/utils-server";
import { getUser } from "@/services/user.service";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const admin = await requireAdminPage();
  const user = serialize(await getUser(admin.id));
  return (
    <div className="space-y-6">
      <PageHeader title="My profile" subtitle="Manage your personal details and password." />
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <UserAvatar name={user.name} email={user.email} size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{user.name}</h2>
              <RoleBadge role={user.role} />
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="text-xs text-muted-foreground">
              Member since {formatDate(user.createdAt)} · Last sign-in {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"}
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <ProfileForm profile={user} />
        <ChangePasswordForm />
      </div>
      {user.role === "super_admin" && (
        <p className="text-xs text-muted-foreground">
          The Super Admin&apos;s email is set by <code>ADMIN_EMAIL</code> on the server. To change it, update the environment and run <code>npm run seed:admin</code>.
        </p>
      )}
    </div>
  );
}
