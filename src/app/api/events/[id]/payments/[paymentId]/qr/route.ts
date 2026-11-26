import { route } from "@/lib/api/handler";
import { requireUserApi } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { upiQrSvg } from "@/lib/upi-qr";
import { getPaymentUpiLink } from "@/services/payment.service";

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

/**
 * UPI QR (SVG) for exactly what is still due on one obligation. Only the payer, the collector and
 * the party's organizers can fetch it. Nothing is cached: the amount changes as payments come in.
 */
export const GET = route<Ctx>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id, paymentId } = await ctx.params;
  const link = await getPaymentUpiLink(id, paymentId, user);
  if (!link) throw notFound("Nothing to pay here, or the recipient has no UPI ID");
  return new Response(await upiQrSvg(link), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
});
