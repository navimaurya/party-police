import { HandCoins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupees, type ContriSplit } from "@/lib/contri";
import { upiQrSvg } from "@/lib/upi-qr";

/**
 * Contri party: what each person owes and a UPI QR (for exactly that amount) that pays the host.
 * Server Component: the QR is rendered to inline SVG on the server.
 */
export async function ContriPaymentCard({ split, hostName, manageHint }: { split: ContriSplit; hostName: string; manageHint?: boolean }) {
  const svg = split.upiLink ? await upiQrSvg(split.upiLink) : null;
  return (
    <Card className="border-teal-200 bg-teal-50/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><HandCoins className="size-4 text-teal-700" /> Split the bill</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {svg ? (
          <div className="mx-auto w-48 shrink-0 space-y-2 sm:mx-0">
            {/* Generated on our server from the host's UPI ID and the share amount: no user HTML. */}
            <div className="overflow-hidden rounded-2xl border bg-white p-1 [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label={`UPI QR code to pay ${formatRupees(split.perHead)} to ${hostName}`} dangerouslySetInnerHTML={{ __html: svg }} />
            <a href={split.upiLink!} className="block rounded-full bg-teal-600 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-teal-700 sm:hidden">
              Pay in a UPI app
            </a>
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">Everyone pays</p>
          <p className="font-heading text-4xl font-bold leading-none">{formatRupees(split.perHead)}</p>
          <p className="text-muted-foreground">
            {formatRupees(split.total)} split between {split.headcount} {split.headcount === 1 ? "person" : "people"}. {hostName} paid the bill, so the other {split.payers} pay {hostName} back.
          </p>
          {split.upiId ? (
            <p>Scan with any UPI app (GPay, PhonePe, Paytm, BHIM…) · UPI ID <strong className="break-all">{split.upiId}</strong></p>
          ) : (
            <p className="rounded-lg bg-amber-50 p-2 text-amber-900">
              {hostName} hasn&apos;t added a UPI ID yet, so there&apos;s no QR code.{manageHint ? " Add it on the party below or on the host's profile." : " Ask them for it, or pay in cash."}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
