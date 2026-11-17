import Link from "next/link";
import { CalendarDays, MapPin, User, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CategoryBadge, InstantBadge, StatusBadge } from "@/components/shared/badges";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { EventCategory, EventStatus, EventType } from "@/types";

export type EventCardData = {
  _id: string;
  title: string;
  category: EventCategory;
  eventType: EventType;
  status: EventStatus;
  organizerName: string;
  occasion?: string;
  location?: string;
  eventDate: string;
  budget?: number | null;
  currency?: string;
};

export function EventCard({ event, href, showBudget = false }: { event: EventCardData; href?: string; showBudget?: boolean }) {
  const content = (
    <Card className={`cat-${event.category} h-full border-l-4 border-l-[var(--cat)] transition hover:-translate-y-0.5 hover:shadow-md`}>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={event.category} />
          {event.eventType === "instant" && <InstantBadge />}
          {event.status !== "upcoming" && <StatusBadge status={event.status} />}
        </div>
        <div>
          <h3 className="line-clamp-2 text-lg font-semibold leading-snug">{event.title}</h3>
          {event.occasion && <p className="text-sm text-muted-foreground">{event.occasion}</p>}
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><User className="size-4" /> Hosted by <span className="font-medium text-foreground">{event.organizerName}</span></li>
          <li className="flex items-center gap-2"><CalendarDays className="size-4" /> {formatDateTime(event.eventDate)}</li>
          {event.location && <li className="flex items-center gap-2"><MapPin className="size-4" /> {event.location}</li>}
          {showBudget && event.budget != null && (
            <li className="flex items-center gap-2"><Wallet className="size-4" /> {formatMoney(event.budget, event.currency)}</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl">{content}</Link> : content;
}
