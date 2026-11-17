import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { EventForm } from "@/components/admin/event-form";
import { toFormValue } from "@/components/admin/event-form-value";
import { PageHeader } from "@/components/admin/page-header";
import { requireAdminPage } from "@/lib/auth";
import { serialize } from "@/lib/utils-server";
import { getBudgetConfig } from "@/services/budget.service";
import { listActiveUsers } from "@/services/user.service";
import { ROLE_LABELS } from "@/types";
import { EVENT_CATEGORIES, type EventCategory } from "@/types";

export const metadata: Metadata = { title: "New party" };

export default async function NewPartyPage(props: PageProps<"/admin/parties/new">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const type = sp.type === "instant" ? "instant" : "scheduled";
  const category = EVENT_CATEGORIES.includes(sp.category as EventCategory) ? (sp.category as EventCategory) : "monthly";
  const [budgetRaw, membersRaw] = await Promise.all([getBudgetConfig(), listActiveUsers()]);
  const budget = serialize(budgetRaw);
  const members = membersRaw.map((m) => ({ name: m.name, email: m.email, role: ROLE_LABELS[m.role] }));
  return (
    <div>
      <PageHeader title={type === "instant" ? "🚨 Instant party announcement" : "🎉 Schedule a party"} subtitle="Someone owes us. Let's make it official." />
      <Card>
        <CardContent>
          <EventForm initial={toFormValue({ eventType: type, category })} budgetRules={budget.categories} validationEnabled={budget.validationEnabled} members={members} />
        </CardContent>
      </Card>
    </div>
  );
}
