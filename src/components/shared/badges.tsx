import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CATEGORY_EMOJI, CATEGORY_LABELS, type EventCategory, type EventStatus } from "@/types";

const CATEGORY_STYLE: Record<EventCategory, string> = {
  monthly: "bg-pink-100 text-pink-700 border-pink-200",
  special: "bg-violet-100 text-violet-700 border-violet-200",
  occasional: "bg-amber-100 text-amber-800 border-amber-200",
};

export const CATEGORY_DOT: Record<EventCategory, string> = {
  monthly: "bg-pink-500",
  special: "bg-violet-500",
  occasional: "bg-amber-500",
};

export function CategoryBadge({ category, className }: { category: EventCategory; className?: string }) {
  return (
    <Badge variant="outline" className={cn(CATEGORY_STYLE[category], className)}>
      {CATEGORY_EMOJI[category]} {CATEGORY_LABELS[category]}
    </Badge>
  );
}

const STATUS_STYLE: Record<EventStatus, string> = {
  upcoming: "bg-sky-100 text-sky-700 border-sky-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-zinc-100 text-zinc-600 border-zinc-200 line-through",
};

const STATUS_LABEL: Record<EventStatus, string> = {
  upcoming: "Upcoming",
  completed: "Completed ✅",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLE[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function InstantBadge() {
  return (
    <Badge variant="outline" className="border-red-200 bg-red-100 text-red-700 animate-pulse">
      🚨 Instant
    </Badge>
  );
}
