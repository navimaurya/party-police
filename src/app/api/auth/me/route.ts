import { ok, route } from "@/lib/api/handler";
import { getAdmin } from "@/lib/auth";
import { unauthorized } from "@/lib/errors";

export const GET = route(async () => {
  const admin = await getAdmin();
  if (!admin) throw unauthorized();
  return ok({ id: admin.id, email: admin.email, name: admin.name, role: admin.role });
});
