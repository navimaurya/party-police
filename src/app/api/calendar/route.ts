import { ok, route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/params";
import { getSessionUser } from "@/lib/auth";
import { isPartyManager } from "@/types";
import { CalendarQuerySchema } from "@/lib/validation";
import { getCalendarEvents } from "@/services/event.service";

export const GET = route(async (req) => {
  const { from, to } = parseQuery(req, CalendarQuerySchema);
  const user = await getSessionUser();
  const usable = user && !user.mustChangePassword ? user : null;
  return ok(await getCalendarEvents(from, to, { admin: !!usable && isPartyManager(usable.role), viewerEmail: usable?.email }));
});
