import { ok, readJson, route } from "@/lib/api/handler";
import type { IdContext } from "@/lib/api/params";
import { requireAdminApi } from "@/lib/auth";
import { DiscountUpdateSchema } from "@/lib/validation";
import { deleteDiscount, updateDiscount } from "@/services/discount.service";

export const PATCH = route<IdContext>(async (req, ctx) => {
  const admin = await requireAdminApi(req);
  const { id } = await ctx.params;
  return ok(await updateDiscount(id, DiscountUpdateSchema.parse(await readJson(req)), admin.id));
});

export const DELETE = route<IdContext>(async (req, ctx) => {
  const admin = await requireAdminApi(req);
  const { id } = await ctx.params;
  await deleteDiscount(id, admin.id);
  return ok({ deleted: true });
});
