import { ok, readJson, route } from "@/lib/api/handler";
import type { IdContext } from "@/lib/api/params";
import { requireUserApi } from "@/lib/auth";
import { EventStatusSchema } from "@/lib/validation";
import { setEventStatus } from "@/services/event.service";

export const PATCH = route<IdContext>(async (req, ctx) => {
  // Approving / un-approving is admin-only; managers and the giver can cancel or restore (service rules).
  const user = await requireUserApi(req);
  const { id } = await ctx.params;
  const { status } = EventStatusSchema.parse(await readJson(req));
  return ok(await setEventStatus(id, status, user.id, user));
});
