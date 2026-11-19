import { ok, readJson, route } from "@/lib/api/handler";
import type { IdContext } from "@/lib/api/params";
import { getPartyManager, requireAdminApi, requireUserApi } from "@/lib/auth";
import { UpdateEventSchema } from "@/lib/validation";
import { deleteEvent, getEvent, updateEvent } from "@/services/event.service";

export const GET = route<IdContext>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const admin = await getPartyManager();
  return ok(await getEvent(id, { admin: !!admin }));
});

export const PATCH = route<IdContext>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id } = await ctx.params;
  const input = UpdateEventSchema.parse(await readJson(req));
  return ok(await updateEvent(id, input, user.id, user));
});

export const DELETE = route<IdContext>(async (req, ctx) => {
  const admin = await requireAdminApi(req);
  const { id } = await ctx.params;
  await deleteEvent(id, admin.id);
  return ok({ deleted: true });
});
