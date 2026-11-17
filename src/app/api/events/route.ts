import { ok, readJson, route } from "@/lib/api/handler";
import { pageMeta, parseQuery } from "@/lib/api/params";
import { getAdmin, requireAdminApi } from "@/lib/auth";
import { CreateEventSchema, EventListQuerySchema } from "@/lib/validation";
import { createEvent, listEvents } from "@/services/event.service";

/** Public: only publicly visible events. Admin session: everything. */
export const GET = route(async (req) => {
  const q = parseQuery(req, EventListQuerySchema);
  const admin = await getAdmin();
  const { items, total } = await listEvents(q, { admin: !!admin });
  return ok(items, { meta: pageMeta(q.page, q.limit, total) });
});

export const POST = route(async (req) => {
  const admin = await requireAdminApi(req);
  const input = CreateEventSchema.parse(await readJson(req));
  const event = await createEvent(input, admin.id);
  return ok(event, { status: 201 });
});
