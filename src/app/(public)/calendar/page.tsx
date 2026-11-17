import type { Metadata } from "next";
import { PartyCalendar } from "@/components/calendar/party-calendar";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">📅 Party Calendar</h1>
        <p className="text-muted-foreground">Monthly, weekly and daily views. Click a party for details, or a date to zoom in.</p>
      </div>
      <PartyCalendar />
    </div>
  );
}
