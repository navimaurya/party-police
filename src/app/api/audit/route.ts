import { ok, route } from "@/lib/api/handler";
import { pageMeta, searchParamsObject } from "@/lib/api/params";
import { requireAdminApi } from "@/lib/auth";
import { ListQuerySchema } from "@/lib/validation";
import { listAuditLogs } from "@/services/audit.service";

export const GET = route(async (req) => {
  await requireAdminApi(req);
  const { entityType, action, ...rest } = searchParamsObject(req);
  const q = ListQuerySchema.parse(rest);
  const { items, total } = await listAuditLogs({ ...q, entityType, action });
  return ok(items, { meta: pageMeta(q.page, q.limit, total) });
});
