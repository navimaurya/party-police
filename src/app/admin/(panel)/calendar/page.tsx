import type { Metadata } from "next";
import { PartyCalendar } from "@/components/calendar/party-calendar";
import { PageHeader } from "@/components/admin/page-header";
import { LinkButton } from "@/components/shared/link-button";

export const metadata: Metadata = { title: "Calendar" };

export default function AdminCalendarPage() {
  return (
    <div>
      <PageHeader title="📅 Calendar" subtitle="Click a party to open it, or the + on a date to schedule a party on that day." action={<LinkButton href="/admin/parties/new">+ New party</LinkButton>} />
      <PartyCalendar linkPrefix="/admin/parties/" schedulePath="/admin/parties/new" />
    </div>
  );
}
