import { ok, route } from "@/lib/api/handler";
import { requireAdminApi } from "@/lib/auth";
import { getDashboardStats } from "@/services/dashboard.service";

export const GET = route(async (req) => {
  await requireAdminApi(req);
  return ok(await getDashboardStats());
});
