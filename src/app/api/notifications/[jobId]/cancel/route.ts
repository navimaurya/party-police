import { ok, route } from "@/lib/api/handler";
import { requireAdminApi } from "@/lib/auth";
import { cancelJob } from "@/services/notification.service";

type Ctx = { params: Promise<{ jobId: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const admin = await requireAdminApi(req);
  const { jobId } = await ctx.params;
  await cancelJob(jobId, admin.id);
  return ok({ cancelled: true });
});
