import Link from "next/link";
import type { Metadata } from "next";
import { CommitmentsManager } from "@/components/admin/commitments-manager";
import { PageHeader } from "@/components/admin/page-header";
import { requireAdminPage } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { serialize } from "@/lib/utils-server";
import { CommitmentListQuerySchema } from "@/lib/validation";
import { listCommitments } from "@/services/commitment.service";
import { listEvents } from "@/services/event.service";
import { COMMITMENT_DEFAULT_SORT } from "@/lib/sort-fields";

export const metadata: Metadata = { title: "Party Defaulters" };

export default async function DefaultersPage(props: PageProps<"/admin/defaulters">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" ? sp.status : "pending";
  const sort = typeof sp.sort === "string" ? sp.sort : undefined;
  const q = CommitmentListQuerySchema.parse({ status: status === "all" ? undefined : status, limit: 100, sort });
  const [{ items, total }, events] = await Promise.all([
    listCommitments(q, { admin: true }),
    listEvents({ page: 1, limit: 100, sort: "-eventDate" }, { admin: true }),
  ]);
  const tab = (s: string, label: string) => (
    <Link href={`/admin/defaulters?status=${s}${sort ? `&sort=${encodeURIComponent(sort)}` : ""}`} className={cn("rounded-full border px-3 py-1 text-xs font-medium", status === s ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{label}</Link>
  );
  return (
    <div>
      <PageHeader title="😬 Party Defaulters" subtitle={`${total} record${total === 1 ? "" : "s"}`} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {tab("pending", "Pending")}
        {tab("completed", "Completed")}
        {tab("waived", "Waived")}
        {tab("all", "All")}
      </div>
      <CommitmentsManager sort={sort ?? COMMITMENT_DEFAULT_SORT} items={serialize(items)} events={serialize(events.items).map((e) => ({ _id: e._id, title: e.title }))} />
    </div>
  );
}
