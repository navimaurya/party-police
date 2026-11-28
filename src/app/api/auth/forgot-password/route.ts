import { ok, readJson, route } from "@/lib/api/handler";
import { assertSameOrigin, clientIp } from "@/lib/auth";
import { ForgotPasswordSchema } from "@/lib/validation";
import { requestPasswordReset } from "@/services/password.service";

/** Emails a reset link. Same answer whether or not the address has an account. */
export const POST = route(async (req) => {
  await assertSameOrigin(req);
  const { email } = ForgotPasswordSchema.parse(await readJson(req));
  await requestPasswordReset(email, await clientIp());
  return ok({ sent: true }, { status: 202 });
});
