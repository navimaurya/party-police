import { cookies, headers } from "next/headers";
import { ok, readJson, route } from "@/lib/api/handler";
import { LoginSchema } from "@/lib/validation";
import { login } from "@/services/auth.service";
import { SESSION_COOKIE, assertSameOrigin, clientIp, sessionCookieOptions } from "@/lib/auth";

export const POST = route(async (req) => {
  await assertSameOrigin(req);
  const body = LoginSchema.parse(await readJson(req));
  const result = await login({
    ...body,
    ip: await clientIp(),
    userAgent: (await headers()).get("user-agent") ?? "",
  });
  (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
  return ok({ admin: result.admin, user: result.user });
});
