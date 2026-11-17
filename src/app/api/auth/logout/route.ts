import { cookies } from "next/headers";
import { ok, route } from "@/lib/api/handler";
import { logout } from "@/services/auth.service";
import { SESSION_COOKIE, assertSameOrigin } from "@/lib/auth";

export const POST = route(async (req) => {
  await assertSameOrigin(req);
  const jar = await cookies();
  await logout(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  return ok({ loggedOut: true });
});
