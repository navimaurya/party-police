import { ok, readJson, route } from "@/lib/api/handler";
import { requireUserApi } from "@/lib/auth";
import { PaymentRecordSchema } from "@/lib/validation";
import { recordPayment } from "@/services/payment.service";

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

/** "Mark paid" (receiver/admin) or "I've paid" (payer: a request for approval). Replays with the same idempotency key are no-ops. */
export const POST = route<Ctx>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id, paymentId } = await ctx.params;
  const input = PaymentRecordSchema.parse(await readJson(req));
  const { payment, duplicate, awaitingApproval = false } = await recordPayment(id, paymentId, input, user);
  // awaitingApproval: the payer reported it; it counts once the receiver or an admin approves.
  return ok({ payment, duplicate, awaitingApproval }, { status: duplicate ? 200 : 201 });
});
