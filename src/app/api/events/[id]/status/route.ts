import { ok, readJson, route } from "@/lib/api/handler";
import type { IdContext } from "@/lib/api/params";
import { requireAdminApi } from "@/lib/auth";
import { EventStatusSchema } from "@/lib/validation";
import { setEventStatus } from "@/services/event.service";

export const PATCH = route<IdContext>(async (req, ctx) => {
  const admin = await requireAdminApi(req);
  const { id } = await ctx.params;
  const { status } = EventStatusSchema.parse(await readJson(req));
  return ok(await setEventStatus(id, status, admin.id));
});
