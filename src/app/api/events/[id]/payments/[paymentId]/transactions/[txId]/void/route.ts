import { ok, readJson, route } from "@/lib/api/handler";
import { requireUserApi } from "@/lib/auth";
import { VoidTransactionSchema } from "@/lib/validation";
import { voidTransaction } from "@/services/payment.service";

type Ctx = { params: Promise<{ id: string; paymentId: string; txId: string }> };

/** Undo a payment recorded by mistake (kept in the history as voided). */
export const POST = route<Ctx>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id, paymentId, txId } = await ctx.params;
  const input = VoidTransactionSchema.parse(await readJson(req));
  return ok(await voidTransaction(id, paymentId, txId, input, user));
});
