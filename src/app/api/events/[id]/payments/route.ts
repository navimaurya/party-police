import { ok, readJson, route } from "@/lib/api/handler";
import type { IdContext } from "@/lib/api/params";
import { requireUserApi } from "@/lib/auth";
import { PaymentCreateSchema } from "@/lib/validation";
import { createPayment, getPartyPayments } from "@/services/payment.service";

/** The party's payments as the viewer may see them (organizers: all; others: their own). */
export const GET = route<IdContext>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id } = await ctx.params;
  return ok(await getPartyPayments(id, user));
});

/** Assign an individual share (or another obligation). */
export const POST = route<IdContext>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id } = await ctx.params;
  const input = PaymentCreateSchema.parse(await readJson(req));
  return ok(await createPayment(id, input, user), { status: 201 });
});
