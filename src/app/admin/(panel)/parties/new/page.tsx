import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { EventForm } from "@/components/admin/event-form";
import { toFormValue } from "@/components/admin/event-form-value";
import { PageHeader } from "@/components/admin/page-header";
import { requireUserPage } from "@/lib/auth";
import { DAY_KEY_RE } from "@/lib/validation";
import { serialize } from "@/lib/utils-server";
import { getBudgetConfig } from "@/services/budget.service";
import { listActiveUsers } from "@/services/user.service";
import { EVENT_CATEGORIES, ROLE_LABELS, isPartyManager, type EventCategory } from "@/types";

export const metadata: Metadata = { title: "New party" };

export default async function NewPartyPage(props: PageProps<"/admin/parties/new">) {
  const user = await requireUserPage();
  const sp = await props.searchParams;
  const type = sp.type === "instant" ? "instant" : "scheduled";
  const category = EVENT_CATEGORIES.includes(sp.category as EventCategory) ? (sp.category as EventCategory) : "monthly";
  // Picked from the calendar: "?date=yyyy-MM-dd" prefills the party day.
  const date = typeof sp.date === "string" && DAY_KEY_RE.test(sp.date) ? sp.date : "";
  const [budgetRaw, membersRaw] = await Promise.all([getBudgetConfig(), listActiveUsers()]);
  const budget = serialize(budgetRaw);
  const members = membersRaw.map((m) => ({ name: m.name, email: m.email, role: ROLE_LABELS[m.role] }));
  const viewer = { email: user.email, name: user.name, role: user.role };
  // Members can only add parties they're giving.
  const initial = { ...toFormValue({ eventType: type, category }), ...(date ? { eventDate: date } : {}), ...(isPartyManager(user.role) ? {} : { organizerName: user.name, organizerEmail: user.email }) };
  return (
    <div>
      <PageHeader title={type === "instant" ? "🚨 Instant party announcement" : "🎉 Schedule a party"} subtitle="Someone owes us. Let's make it official." />
      <Card>
        <CardContent>
          <EventForm initial={initial} budgetRules={budget.categories} validationEnabled={budget.validationEnabled} members={members} viewer={viewer} />
        </CardContent>
      </Card>
    </div>
  );
}
