import type { Metadata } from "next";
import { DiscountsManager } from "@/components/admin/discounts-manager";
import { PageHeader } from "@/components/admin/page-header";
import { requireAdminPage } from "@/lib/auth";
import { serialize } from "@/lib/utils-server";
import { listAllDiscounts } from "@/services/discount.service";
import { parseSort } from "@/lib/sort";
import { DISCOUNT_DEFAULT_SORT, DISCOUNT_SORT_FIELDS } from "@/lib/sort-fields";

export const metadata: Metadata = { title: "Discount Management" };

export default async function DiscountsAdminPage(props: PageProps<"/admin/discounts">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const sort = parseSort(sp.sort, DISCOUNT_SORT_FIELDS, DISCOUNT_DEFAULT_SORT);
  const { items } = await listAllDiscounts({ page: 1, limit: 100, sort: sort.value });
  return (
    <div>
      <PageHeader title="🏷️ Discount Management" subtitle="Only live deals (active and within their dates) appear on the public site." />
      <DiscountsManager items={serialize(items)} sort={sort.value} />
    </div>
  );
}
