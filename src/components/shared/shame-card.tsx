import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { shameLevel } from "@/lib/humor";
import { cn } from "@/lib/utils";

const LEVEL_STYLE = {
  waiting: "border-sky-200 bg-sky-50",
  mild: "border-yellow-200 bg-yellow-50",
  medium: "border-orange-200 bg-orange-50",
  spicy: "border-rose-200 bg-rose-50",
  nuclear: "border-red-300 bg-red-50 ring-2 ring-red-200",
} as const;

export type ShameData = { _id: string; personName: string; reason: string; dueDate: string; overdueDays: number; tease: string };

export function ShameCard({ c, rank }: { c: ShameData; rank: number }) {
  const level = shameLevel(c.overdueDays);
  return (
    <Card className={cn("border", LEVEL_STYLE[level])}>
      <CardContent className="flex items-start gap-3">
        <span className="font-heading text-2xl font-bold text-muted-foreground/60">#{rank}</span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">{c.personName}</h3>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", c.overdueDays > 0 ? "bg-red-600 text-white" : "bg-sky-600 text-white")}>
              {c.overdueDays > 0 ? `${c.overdueDays} day${c.overdueDays === 1 ? "" : "s"} overdue` : `Due ${formatDate(c.dueDate)}`}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">Owes a party for: <span className="font-medium text-foreground">{c.reason}</span></p>
          <p className="text-sm italic">{c.tease}</p>
        </div>
      </CardContent>
    </Card>
  );
}
