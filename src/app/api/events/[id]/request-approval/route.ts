import { ok, route } from "@/lib/api/handler";
import type { IdContext } from "@/lib/api/params";
import { requireUserApi } from "@/lib/auth";
import { requestApproval } from "@/services/event.service";

/** The party giver (or a manager) says the party was given; the Super Admin is asked to approve it. */
export const POST = route<IdContext>(async (req, ctx) => {
  const user = await requireUserApi(req);
  const { id } = await ctx.params;
  return ok(await requestApproval(id, user), { status: 202 });
});
