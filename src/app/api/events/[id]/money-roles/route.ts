import { ok, readJson, route } from "@/lib/api/handler";
import type { IdContext } from "@/lib/api/params";
import { requireUserApi } from "@/lib/auth";
import { MoneyRoleCreateSchema } from "@/lib/validation";
import { createMoneyRole } from "@/services/payment.service";

/** Add a lender (with what they provide) or a provider who collects payments. */
export const POST = route<IdContext>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id } = await ctx.params;
  const input = MoneyRoleCreateSchema.parse(await readJson(req));
  return ok(await createMoneyRole(id, input, user), { status: 201 });
});
