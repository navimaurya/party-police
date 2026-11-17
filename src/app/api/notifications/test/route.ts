import { ok, readJson, route } from "@/lib/api/handler";
import { requireAdminApi } from "@/lib/auth";
import { TestEmailSchema } from "@/lib/validation";
import { sendTestEmail } from "@/services/notification.service";

export const POST = route(async (req) => {
  const admin = await requireAdminApi(req);
  const { to } = TestEmailSchema.parse(await readJson(req));
  await sendTestEmail(to, admin.id);
  return ok({ sent: true });
});
