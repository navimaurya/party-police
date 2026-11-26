import { dayKey } from "@/lib/time";
import type { EventCategory, EventStatus, EventType, PaymentModel } from "@/types";

/**
 * Shape of the party form, plus the helper that builds it from an event.
 * Kept out of event-form.tsx ("use client") so Server Components can call it (server only:
 * the party day is computed in APP_TIMEZONE).
 */
export type EventFormValue = {
  _id?: string;
  title: string;
  eventType: EventType;
  category: EventCategory;
  organizerName: string;
  organizerEmail?: string | null;
  occasion?: string;
  description?: string;
  location?: string;
  /** Party day, "yyyy-MM-dd" (parties have no time). */
  eventDate?: string;
  participants: { name: string; email?: string | null }[];
  budget?: number | null;
  /** Contri party split (category "contri"). */
  contri?: { totalAmount?: number | null; splitCount?: number | null; upiId?: string | null } | null;
  /** How the party is paid for (lenders & providers, or the standard flow). */
  paymentModel?: PaymentModel;
  currency?: string;
  status: EventStatus;
  publicVisibility: boolean;
  notificationPreferences?: { reminders?: boolean; announcement?: boolean; updates?: boolean; thankYou?: boolean; includeBillLinks?: boolean } | null;
};

export function toFormValue(e: Partial<Omit<EventFormValue, "participants">> & { eventDate?: string; participants?: { name: string; email?: string | null }[] }): EventFormValue {
  return {
    _id: e._id,
    title: e.title ?? "",
    eventType: e.eventType ?? "scheduled",
    category: e.category ?? "monthly",
    organizerName: e.organizerName ?? "",
    organizerEmail: e.organizerEmail ?? "",
    occasion: e.occasion ?? "",
    description: e.description ?? "",
    location: e.location ?? "",
    eventDate: e.eventDate ? dayKey(e.eventDate) : "",
    participants: e.participants ?? [],
    budget: e.budget ?? null,
    contri: { totalAmount: e.contri?.totalAmount ?? null, splitCount: e.contri?.splitCount ?? null, upiId: e.contri?.upiId ?? "" },
    paymentModel: e.paymentModel === "lender_provider" ? "lender_provider" : "standard",
    currency: e.currency ?? "INR",
    status: e.status ?? "upcoming",
    publicVisibility: e.publicVisibility ?? true,
    notificationPreferences: e.notificationPreferences,
  };
}
