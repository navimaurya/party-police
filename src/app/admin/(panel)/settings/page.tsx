import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { AppSettingsForm } from "@/components/admin/settings-forms";
import { requireAdminPage } from "@/lib/auth";
import { serialize } from "@/lib/utils-server";
import { getSettings } from "@/services/settings.service";

export const metadata: Metadata = { title: "Application Settings" };

export default async function SettingsPage() {
  await requireAdminPage();
  const settings = serialize(await getSettings());
  return (
    <div>
      <PageHeader title="⚙️ Application Settings" subtitle="SMTP credentials live in environment variables, never in the database." />
      <AppSettingsForm settings={settings} />
    </div>
  );
}
