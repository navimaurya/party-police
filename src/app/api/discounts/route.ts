import { ok, readJson, route } from "@/lib/api/handler";
import { pageMeta, searchParamsObject } from "@/lib/api/params";
import { getAdmin, requireAdminApi } from "@/lib/auth";
import { unauthorized } from "@/lib/errors";
import { DiscountCreateSchema, ListQuerySchema } from "@/lib/validation";
import { EVENT_CATEGORIES, type EventCategory } from "@/types";
import { createDiscount, listActiveDiscounts, listAllDiscounts } from "@/services/discount.service";

/** Public: active, non-expired, applicable discounts only. `?all=true` requires admin. */
export const GET = route(async (req) => {
  const { all, category, venue, ...rest } = searchParamsObject(req);
  if (all === "true") {
    if (!(await getAdmin())) throw unauthorized();
    const q = ListQuerySchema.parse(rest);
    const { items, total } = await listAllDiscounts(q);
    return ok(items, { meta: pageMeta(q.page, q.limit, total) });
  }
  const cat = EVENT_CATEGORIES.includes(category as EventCategory) ? (category as EventCategory) : undefined;
  return ok(await listActiveDiscounts({ category: cat, venue: venue?.slice(0, 300) }));
});

export const POST = route(async (req) => {
  const admin = await requireAdminApi(req);
  return ok(await createDiscount(DiscountCreateSchema.parse(await readJson(req)), admin.id), { status: 201 });
});
