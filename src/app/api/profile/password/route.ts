import { ok, readJson, route } from "@/lib/api/handler";
import { requireAdminApi } from "@/lib/auth";
import { ChangePasswordSchema } from "@/lib/validation";
import { changeOwnPassword } from "@/services/user.service";

/** Changes the signed-in user's password; their other sessions are signed out. */
export const POST = route(async (req) => {
  const admin = await requireAdminApi(req);
  await changeOwnPassword(admin, ChangePasswordSchema.parse(await readJson(req)));
  return ok({ changed: true });
});
