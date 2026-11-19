import { ok, readJson, route } from "@/lib/api/handler";
import { requireSuperAdminApi } from "@/lib/auth";
import { CredentialsSendSchema } from "@/lib/validation";
import { sendCredentials } from "@/services/user.service";

/** Super Admin: email login details (username + one-time password) to one user, or to everyone who can't sign in yet. */
export const POST = route(async (req) => {
  const admin = await requireSuperAdminApi(req);
  const input = CredentialsSendSchema.parse(await readJson(req));
  return ok(await sendCredentials(input, admin), { status: 202 });
});
