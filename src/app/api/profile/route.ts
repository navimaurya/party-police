import { ok, readJson, route } from "@/lib/api/handler";
import { requireAdminApi } from "@/lib/auth";
import { ProfileUpdateSchema } from "@/lib/validation";
import { getUser, updateOwnProfile } from "@/services/user.service";

/** The signed-in user's own profile. */
export const GET = route(async (req) => {
  const admin = await requireAdminApi(req);
  return ok(await getUser(admin.id));
});

export const PATCH = route(async (req) => {
  const admin = await requireAdminApi(req);
  return ok(await updateOwnProfile(admin, ProfileUpdateSchema.parse(await readJson(req))));
});
