import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { DiscountCard } from "@/components/shared/discount-card";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionSkeleton } from "@/components/shared/section";
import { EMPTY_STATES } from "@/lib/humor";
import { serialize } from "@/lib/utils-server";
import { listActiveDiscounts } from "@/services/discount.service";

export const metadata: Metadata = { title: "Party Deals" };

export default function DiscountsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">🍕 Party Deals</h1>
        <p className="text-muted-foreground">Hand-picked by the Party Committee. Use them wisely (or greedily).</p>
      </div>
      <Suspense fallback={<SectionSkeleton />}>
        <Deals />
      </Suspense>
    </div>
  );
}

async function Deals() {
  await connection();
  const deals = serialize(await listActiveDiscounts());
  if (!deals.length) return <EmptyState emoji="💸" message={EMPTY_STATES.discounts} />;
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{deals.map((d) => <DiscountCard key={d._id} d={d} />)}</div>;
}
