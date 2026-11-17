import type { Metadata } from "next";
import { BudgetForm } from "@/components/admin/budget-form";
import { PageHeader } from "@/components/admin/page-header";
import { requireAdminPage } from "@/lib/auth";
import { serialize } from "@/lib/utils-server";
import { getBudgetConfig } from "@/services/budget.service";

export const metadata: Metadata = { title: "Budget Settings" };

export default async function BudgetsPage() {
  await requireAdminPage();
  const cfg = serialize(await getBudgetConfig());
  return (
    <div>
      <PageHeader title="💰 Budget Settings" subtitle="Out-of-range budgets are rejected unless you override them (overrides are audited). Changes never modify existing parties." />
      <BudgetForm validationEnabled={cfg.validationEnabled} categories={cfg.categories} />
    </div>
  );
}
