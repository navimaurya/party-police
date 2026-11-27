import { CheckCircle2, HandCoins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelfPayButton } from "@/components/payments/payments-panel";
import { formatRupees, type ContriSplit } from "@/lib/contri";
import { upiQrSvg } from "@/lib/upi-qr";
import type { ContriPaymentState } from "@/services/payment.service";

/**
 * Contri party: what each person owes and a UPI QR (for exactly that amount) that pays the host.
 * With payment tracking (`state`): no QR once everyone has paid, none for a viewer who has paid,
 * and a viewer who still owes something gets a QR for exactly their remaining amount.
 * Server Component: the QR is rendered to inline SVG on the server.
 */
export async function ContriPaymentCard({ split, hostName, manageHint, state }: { split: ContriSplit; hostName: string; manageHint?: boolean; state?: ContriPaymentState | null }) {
  const mine = state?.mine ?? null;
  const settled = !!state?.allPaid;
  const iPaid = !!mine && mine.due === 0;
  const owe = mine && mine.due > 0 ? mine.due : split.perHead;
  const link = settled || iPaid ? null : mine && mine.due > 0 ? mine.upiLink : split.upiLink;
  const svg = link ? await upiQrSvg(link) : null;
  const progress = state ? `${state.paidShares} of ${state.shares} ${state.shares === 1 ? "person has" : "people have"} paid.` : null;

  return (
    <Card className={settled ? "border-emerald-200 bg-emerald-50/40" : "border-teal-200 bg-teal-50/40"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><HandCoins className="size-4 text-teal-700" /> Split the bill</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {svg ? (
          <div className="mx-auto w-48 shrink-0 space-y-2 sm:mx-0">
            {/* Generated on our server from the host's UPI ID and the share amount: no user HTML. */}
            <div className="overflow-hidden rounded-2xl border bg-white p-1 [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label={`UPI QR code to pay ${formatRupees(owe)} to ${hostName}`} dangerouslySetInnerHTML={{ __html: svg }} />
            <a href={link!} className="block rounded-full bg-teal-600 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-teal-700 sm:hidden">
              Pay in a UPI app
            </a>
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          {settled ? (
            <>
              <p className="flex items-center gap-2 font-heading text-2xl font-bold leading-none text-emerald-700"><CheckCircle2 className="size-6" /> All settled</p>
              <p className="text-muted-foreground">Everyone has paid {hostName} back their {formatRupees(split.perHead)}. Nothing left to scan. 🎉</p>
            </>
          ) : iPaid ? (
            <>
              <p className="flex items-center gap-2 font-heading text-2xl font-bold leading-none text-emerald-700"><CheckCircle2 className="size-6" /> You&apos;ve paid</p>
              <p className="text-muted-foreground">Your {formatRupees(mine!.total)} to {hostName} is recorded. {progress}</p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">{mine ? "You pay" : "Everyone pays"}</p>
              <p className="font-heading text-4xl font-bold leading-none">{formatRupees(owe)}</p>
              <p className="text-muted-foreground">
                {mine && mine.paid > 0 ? <>You&apos;ve paid {formatRupees(mine.paid)} of {formatRupees(mine.total)}. </> : null}
                {formatRupees(split.total)} split between {split.headcount} {split.headcount === 1 ? "person" : "people"}. {hostName} paid the bill, so the other {split.payers} pay {hostName} back. {progress}
              </p>
              {split.upiId ? (
                <p>Scan with any UPI app (GPay, PhonePe, Paytm, BHIM…) · UPI ID <strong className="break-all">{split.upiId}</strong></p>
              ) : (
                <p className="rounded-lg bg-amber-50 p-2 text-amber-900">
                  {hostName} hasn&apos;t added a UPI ID yet, so there&apos;s no QR code.{manageHint ? " Add it on the party below or on the host's profile." : " Ask them for it, or pay in cash."}
                </p>
              )}
              {mine?.canRecord && <div className="flex flex-wrap items-center gap-2 pt-1"><SelfPayButton p={mine} /><span className="text-xs text-muted-foreground">Paid already? Mark it yourself, so {hostName} doesn&apos;t have to.</span></div>}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
