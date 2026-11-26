import { ok, readJson, route } from "@/lib/api/handler";
import { requireUserApi } from "@/lib/auth";
import { MoneyRoleUpdateSchema } from "@/lib/validation";
import { deleteMoneyRole, updateMoneyRole } from "@/services/payment.service";

type Ctx = { params: Promise<{ id: string; roleId: string }> };

export const PATCH = route<Ctx>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id, roleId } = await ctx.params;
  const input = MoneyRoleUpdateSchema.parse(await readJson(req));
  return ok(await updateMoneyRole(id, roleId, input, user));
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id, roleId } = await ctx.params;
  await deleteMoneyRole(id, roleId, user);
  return ok({ deleted: true });
});
