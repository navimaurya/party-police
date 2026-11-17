import { ok, route } from "@/lib/api/handler";
import { requireAdminApi } from "@/lib/auth";
import { retryJob } from "@/services/notification.service";

type Ctx = { params: Promise<{ jobId: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const admin = await requireAdminApi(req);
  const { jobId } = await ctx.params;
  await retryJob(jobId, admin.id);
  return ok({ queued: true });
});
