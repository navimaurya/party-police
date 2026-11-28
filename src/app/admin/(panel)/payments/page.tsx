import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { PaymentsTable } from "@/components/payments/payments-panel";
import { requireUserPage } from "@/lib/auth";
import { formatRupees } from "@/lib/contri";
import { formatPartyDate } from "@/lib/format";
import { listMyPayments } from "@/services/payment.service";

export const metadata: Metadata = { title: "My payments" };

/**
 * Every signed-in user: the shares and other amounts they owe (with an exact-amount UPI QR),
 * and, for providers and lenders, the payments they collect and can mark as received.
 */
export default async function MyPaymentsPage() {
  const user = await requireUserPage();
  const groups = await listMyPayments(user);
  const owed = groups.flatMap((g) => g.payments).filter((p) => p.isMine).reduce((s, p) => s + Math.round(p.due * 100), 0) / 100;
  const toCollect = groups.flatMap((g) => g.payments).filter((p) => !p.isMine && p.canConfirm).reduce((s, p) => s + Math.round(p.due * 100), 0) / 100;
  const toApprove = groups.flatMap((g) => g.payments).filter((p) => p.canConfirm && p.awaitingApproval > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="💰 My payments"
        subtitle={
          groups.length
            ? <>You owe <strong>{formatRupees(owed)}</strong>{toCollect > 0 && <> · you collect <strong>{formatRupees(toCollect)}</strong></>}{toApprove > 0 && <> · <strong className="text-amber-700">⏳ {toApprove} payment{toApprove === 1 ? "" : "s"} to approve</strong></>}</>
            : "Your party shares and the payments you collect."
        }
      />
      {groups.length === 0 ? (
        <EmptyState emoji="🧾" message="Nothing to pay and nothing to collect. Enjoy it while it lasts." />
      ) : (
        groups.map((g) => (
          <Card key={g.eventId}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
                <span>{g.title} <span className="text-sm font-normal text-muted-foreground">· {formatPartyDate(g.eventDate)}</span></span>
                {g.canManage && <Link href={`/admin/parties/${g.eventId}`} className="text-sm font-normal text-primary hover:underline">Manage payments →</Link>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentsTable eventId={g.eventId} payments={g.payments} canManage={false} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
