import { ok, readJson, route } from "@/lib/api/handler";
import { pageMeta, parseQuery } from "@/lib/api/params";
import { getPartyManager, requireUserApi } from "@/lib/auth";
import { CreateEventSchema, EventListQuerySchema } from "@/lib/validation";
import { createEvent, listEvents } from "@/services/event.service";

/** Public: only publicly visible events. Manager / admin session: everything. */
export const GET = route(async (req) => {
  const q = parseQuery(req, EventListQuerySchema);
  const admin = await getPartyManager();
  const { items, total } = await listEvents(q, { admin: !!admin });
  return ok(items, { meta: pageMeta(q.page, q.limit, total) });
});

export const POST = route(async (req) => {
  // Members may add only parties they give; managers and admins anyone's (enforced in the service).
  const user = await requireUserApi(req);
  const input = CreateEventSchema.parse(await readJson(req));
  const event = await createEvent(input, user.id, user);
  return ok(event, { status: 201 });
});
