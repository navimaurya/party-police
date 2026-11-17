import { ok, route } from "@/lib/api/handler";
import type { IdContext } from "@/lib/api/params";
import { requireAdminApi } from "@/lib/auth";
import { resendWelcome } from "@/services/user.service";

/** Sends the user's welcome email again. */
export const POST = route<IdContext>(async (req, ctx) => {
  const admin = await requireAdminApi(req);
  const { id } = await ctx.params;
  await resendWelcome(id, admin);
  return ok({ queued: true }, { status: 202 });
});
