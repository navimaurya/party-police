import { connection } from "next/server";
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/config/env";
import { forbidden, unauthorized } from "@/lib/errors";
import { validateSessionToken, type AdminIdentity } from "@/services/auth.service";

export const SESSION_COOKIE = "pp_session";

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Reads and validates the admin session from the request cookies (Server Components / Route Handlers). */
export async function getAdmin(): Promise<AdminIdentity | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSessionToken(token);
}

/** For protected pages: redirects to the login page when unauthenticated. */
export async function requireAdminPage(): Promise<AdminIdentity> {
  await connection();
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated mutations: the Origin (or Referer)
 * header must match this application's origin. Combined with SameSite=Lax
 * cookies this blocks cross-site form posts and fetches.
 */
export async function assertSameOrigin(req: Request) {
  if (SAFE_METHODS.has(req.method)) return;
  const h = await headers();
  const origin = h.get("origin") ?? (h.get("referer") ? safeOrigin(h.get("referer")!) : null);
  if (!origin) throw forbidden("Missing Origin header");
  const allowed = new Set<string>([safeOrigin(env().APP_URL)!]);
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    allowed.add(`${proto}://${host}`);
  }
  if (!allowed.has(origin)) throw forbidden("Cross-origin request rejected");
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** For protected API routes: validates session on every request + CSRF check for mutations. */
export async function requireAdminApi(req: Request): Promise<AdminIdentity> {
  const admin = await getAdmin();
  if (!admin) throw unauthorized();
  await assertSameOrigin(req);
  return admin;
}

/** For Super-Admin-only API routes. */
export async function requireSuperAdminApi(req: Request): Promise<AdminIdentity> {
  const admin = await requireAdminApi(req);
  if (admin.role !== "super_admin") throw forbidden("Only the Super Admin can do this");
  return admin;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown").slice(0, 64);
}
