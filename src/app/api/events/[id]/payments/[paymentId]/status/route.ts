import { ok, readJson, route } from "@/lib/api/handler";
import { requireUserApi } from "@/lib/auth";
import { PaymentStatusSchema } from "@/lib/validation";
import { setPaymentStatus } from "@/services/payment.service";

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

/** "Change status" (receiver or admin). Recorded in the payment history. */
export const POST = route<Ctx>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id, paymentId } = await ctx.params;
  return ok(await setPaymentStatus(id, paymentId, PaymentStatusSchema.parse(await readJson(req)), user));
});
