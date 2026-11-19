import { ok, route } from "@/lib/api/handler";
import { getSessionUser } from "@/lib/auth";
import { unauthorized } from "@/lib/errors";

export const GET = route(async () => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return ok({ id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword });
});
