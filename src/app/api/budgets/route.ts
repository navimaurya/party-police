import { ok, readJson, route } from "@/lib/api/handler";
import { requireAdminApi } from "@/lib/auth";
import { BudgetSettingsUpdateSchema } from "@/lib/validation";
import { getBudgetConfig, updateBudgetConfig } from "@/services/budget.service";

export const GET = route(async (req) => {
  await requireAdminApi(req);
  return ok(await getBudgetConfig());
});

export const PATCH = route(async (req) => {
  const admin = await requireAdminApi(req);
  return ok(await updateBudgetConfig(BudgetSettingsUpdateSchema.parse(await readJson(req)), admin.id));
});
