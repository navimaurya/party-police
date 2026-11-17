import { ok, readJson, route } from "@/lib/api/handler";
import { requireAdminApi } from "@/lib/auth";
import { SettingsUpdateSchema } from "@/lib/validation";
import { getSettings, updateSettings } from "@/services/settings.service";

export const GET = route(async (req) => {
  await requireAdminApi(req);
  return ok(await getSettings());
});

export const PATCH = route(async (req) => {
  const admin = await requireAdminApi(req);
  return ok(await updateSettings(SettingsUpdateSchema.parse(await readJson(req)), admin.id));
});
