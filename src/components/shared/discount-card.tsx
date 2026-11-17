import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { CATEGORY_LABELS, type EventCategory } from "@/types";

export type DiscountCardData = {
  _id: string;
  title: string;
  description?: string;
  code?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  applicableVenue?: string;
  applicableCategories?: EventCategory[];
  validUntil?: string | null;
  termsAndConditions?: string;
};

export function DiscountCard({ d }: { d: DiscountCardData }) {
  const value = d.discountType === "percentage" ? `${d.discountValue}% OFF` : `${formatMoney(d.discountValue)} OFF`;
  return (
    <Card className="relative overflow-hidden border-amber-200 bg-gradient-to-br from-amber-50 to-pink-50">
      <CardContent className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">🍕 Special party deal!</p>
        <h3 className="text-lg font-semibold">{d.title}</h3>
        <p className="font-heading text-3xl font-bold text-primary">{value}</p>
        {d.description && <p className="text-sm text-muted-foreground">{d.description}</p>}
        {d.code && (
          <p className="text-sm">
            Use code: <code className="rounded-md border border-dashed border-primary bg-white px-2 py-0.5 font-mono font-semibold text-primary">{d.code}</code>
          </p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {d.applicableVenue && <span>📍 {d.applicableVenue}</span>}
          {d.applicableCategories?.length ? <span>🎯 {d.applicableCategories.map((c) => CATEGORY_LABELS[c]).join(", ")}</span> : null}
          {d.validUntil && <span>⏳ Until {formatDate(d.validUntil)}</span>}
        </div>
        {d.termsAndConditions && <p className="text-[11px] text-muted-foreground/80">T&C: {d.termsAndConditions}</p>}
      </CardContent>
    </Card>
  );
}
