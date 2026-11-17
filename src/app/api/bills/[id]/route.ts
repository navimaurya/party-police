import { ok, readJson, route } from "@/lib/api/handler";
import type { IdContext } from "@/lib/api/params";
import { requireAdminApi } from "@/lib/auth";
import { BillUpdateSchema } from "@/lib/validation";
import { deleteBill, updateBill } from "@/services/bill.service";

export const PATCH = route<IdContext>(async (req, ctx) => {
  const admin = await requireAdminApi(req);
  const { id } = await ctx.params;
  return ok(await updateBill(id, BillUpdateSchema.parse(await readJson(req)), admin.id));
});

export const DELETE = route<IdContext>(async (req, ctx) => {
  const admin = await requireAdminApi(req);
  const { id } = await ctx.params;
  await deleteBill(id, admin.id);
  return ok({ deleted: true });
});
