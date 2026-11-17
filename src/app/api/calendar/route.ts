import { ok, route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/params";
import { getAdmin } from "@/lib/auth";
import { CalendarQuerySchema } from "@/lib/validation";
import { getCalendarEvents } from "@/services/event.service";

export const GET = route(async (req) => {
  const { from, to } = parseQuery(req, CalendarQuerySchema);
  const admin = await getAdmin();
  return ok(await getCalendarEvents(from, to, { admin: !!admin }));
});
