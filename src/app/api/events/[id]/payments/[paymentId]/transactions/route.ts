import { ok, readJson, route } from "@/lib/api/handler";
import { requireUserApi } from "@/lib/auth";
import { PaymentRecordSchema } from "@/lib/validation";
import { recordPayment } from "@/services/payment.service";

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

/** "Mark as paid": records a full or partial payment. Replays with the same idempotency key are no-ops. */
export const POST = route<Ctx>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id, paymentId } = await ctx.params;
  const input = PaymentRecordSchema.parse(await readJson(req));
  const { payment, duplicate } = await recordPayment(id, paymentId, input, user);
  return ok({ payment, duplicate }, { status: duplicate ? 200 : 201 });
});
