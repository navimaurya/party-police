import { ok, route } from "@/lib/api/handler";
import { pageMeta, searchParamsObject } from "@/lib/api/params";
import { requireAdminApi } from "@/lib/auth";
import { ListQuerySchema } from "@/lib/validation";
import { listLogs } from "@/services/notification.service";

export const GET = route(async (req) => {
  await requireAdminApi(req);
  const { status, type, ...rest } = searchParamsObject(req);
  const q = ListQuerySchema.parse(rest);
  const { items, total } = await listLogs({ ...q, status, type });
  return ok(items, { meta: pageMeta(q.page, q.limit, total) });
});
