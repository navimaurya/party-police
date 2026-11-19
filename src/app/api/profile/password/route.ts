import { ok, readJson, route } from "@/lib/api/handler";
import { requireUserApi } from "@/lib/auth";
import { ChangePasswordSchema } from "@/lib/validation";
import { changeOwnPassword } from "@/services/user.service";

/** Changes the signed-in user's password; their other sessions are signed out. */
export const POST = route(async (req) => {
  // The one route that works while a one-time password is in use.
  const admin = await requireUserApi(req, { allowPasswordChange: true });
  await changeOwnPassword(admin, ChangePasswordSchema.parse(await readJson(req)));
  return ok({ changed: true });
});
