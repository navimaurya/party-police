import { ok, readJson, route } from "@/lib/api/handler";
import { assertSameOrigin } from "@/lib/auth";
import { ResetPasswordSchema } from "@/lib/validation";
import { resetPasswordWithToken } from "@/services/password.service";

/** Sets a new password from an emailed reset link (once, within 30 minutes). */
export const POST = route(async (req) => {
  await assertSameOrigin(req);
  return ok(await resetPasswordWithToken(ResetPasswordSchema.parse(await readJson(req))));
});
