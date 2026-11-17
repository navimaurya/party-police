import type { Metadata } from "next";
import { BillsManager } from "@/components/bills/bills-manager";
import { PageHeader } from "@/components/admin/page-header";
import { env } from "@/config/env";
import { requireAdminPage } from "@/lib/auth";
import { serialize } from "@/lib/utils-server";
import { listBills } from "@/services/bill.service";
import { parseSort } from "@/lib/sort";
import { BILL_DEFAULT_SORT, BILL_SORT_FIELDS } from "@/lib/sort-fields";

export const metadata: Metadata = { title: "Bills & Attachments" };

export default async function BillsPage(props: PageProps<"/admin/bills">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const sort = parseSort(sp.sort, BILL_SORT_FIELDS, BILL_DEFAULT_SORT);
  const { items, total } = await listBills({ admin: true, limit: 100, sort: sort.value });
  return (
    <div>
      <PageHeader title="🧾 Bills & Attachments" subtitle={`${total} file${total === 1 ? "" : "s"} stored locally. Upload new files from a party's page.`} />
      <BillsManager bills={serialize(items)} sort={sort.value} showEvent maxSizeMb={Math.round(env().MAX_FILE_SIZE / 1024 / 1024)} />
    </div>
  );
}
