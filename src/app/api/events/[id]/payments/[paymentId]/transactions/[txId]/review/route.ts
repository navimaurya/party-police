import { ok, readJson, route } from "@/lib/api/handler";
import { requireUserApi } from "@/lib/auth";
import { PaymentReviewSchema } from "@/lib/validation";
import { reviewPayment } from "@/services/payment.service";

type Ctx = { params: Promise<{ id: string; paymentId: string; txId: string }> };

/** Approve / reject a payment the payer reported (receiver or admin), or withdraw it (payer). */
export const POST = route<Ctx>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id, paymentId, txId } = await ctx.params;
  return ok(await reviewPayment(id, paymentId, txId, PaymentReviewSchema.parse(await readJson(req)), user));
});
