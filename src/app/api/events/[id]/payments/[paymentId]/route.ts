import { ok, readJson, route } from "@/lib/api/handler";
import { requireUserApi } from "@/lib/auth";
import { PaymentUpdateSchema } from "@/lib/validation";
import { deletePayment, updatePayment } from "@/services/payment.service";

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

export const PATCH = route<Ctx>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id, paymentId } = await ctx.params;
  const input = PaymentUpdateSchema.parse(await readJson(req));
  return ok(await updatePayment(id, paymentId, input, user));
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id, paymentId } = await ctx.params;
  await deletePayment(id, paymentId, user);
  return ok({ deleted: true });
});
