import { z } from "zod";
import { ok, route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/params";
import { requireUserApi } from "@/lib/auth";
import { listUpcomingOccasions } from "@/services/occasion.service";

const Query = z.object({ days: z.coerce.number().int().min(1).max(366).default(60) });

/** Upcoming birthdays, anniversaries and relatives' occasions of the team. Signed-in users only. */
export const GET = route(async (req) => {
  await requireUserApi(req);
  const { days } = parseQuery(req, Query);
  return ok(await listUpcomingOccasions({ days }));
});
