import { ok, route } from "@/lib/api/handler";
import { pageMeta, searchParamsObject } from "@/lib/api/params";
import { requireAdminApi } from "@/lib/auth";
import { ListQuerySchema } from "@/lib/validation";
import { listJobs } from "@/services/notification.service";

/** Scheduled jobs queue. */
export const GET = route(async (req) => {
  await requireAdminApi(req);
  const { status, ...rest } = searchParamsObject(req);
  const q = ListQuerySchema.parse(rest);
  const { items, total } = await listJobs({ ...q, status });
  return ok(items, { meta: pageMeta(q.page, q.limit, total) });
});
