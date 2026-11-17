import type { Metadata } from "next";
import { PartyCalendar } from "@/components/calendar/party-calendar";
import { PageHeader } from "@/components/admin/page-header";
import { LinkButton } from "@/components/shared/link-button";

export const metadata: Metadata = { title: "Calendar" };

export default function AdminCalendarPage() {
  return (
    <div>
      <PageHeader title="📅 Calendar" subtitle="Includes private parties. Click a party to manage it." action={<LinkButton href="/admin/parties/new">+ New party</LinkButton>} />
      <PartyCalendar linkPrefix="/admin/parties/" />
    </div>
  );
}
