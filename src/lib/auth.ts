import { connection } from "next/server";
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/config/env";
import { AppError, forbidden, unauthorized } from "@/lib/errors";
import { validateSessionToken, type AdminIdentity, type SessionUser } from "@/services/auth.service";
import { isAdminRole, isPartyManager } from "@/types";

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

/** Reads and validates the session (any role) from the request cookies. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSessionToken(token);
}

/**
 * The signed-in admin (Super Admin or admin), or null for everyone else, including
 * managers, members and anyone who still has to replace a one-time password.
 */
export async function getAdmin(): Promise<AdminIdentity | null> {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword || !isAdminRole(user.role)) return null;
  return user as AdminIdentity;
}

/** A signed-in manager or admin: sees private parties and can edit anyone's party. */
export async function getPartyManager(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword || !isPartyManager(user.role)) return null;
  return user;
}

export const CHANGE_PASSWORD_PATH = "/admin/change-password";
/** Where a signed-in user without access to a page is sent. Every role can open it. */
export const HOME_PATH = "/admin/parties";

/**
 * For any signed-in user. Redirects to the login page when unauthenticated, and to the
 * change-password page while the user still has a one-time password.
 */
export async function requireUserPage(opts: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect(CHANGE_PASSWORD_PATH);
  return user;
}

/** For manager-and-above pages. */
export async function requireManagerPage(): Promise<SessionUser> {
  const user = await requireUserPage();
  if (!isPartyManager(user.role)) redirect(HOME_PATH);
  return user;
}

/** For admin pages: others are sent to their parties. */
export async function requireAdminPage(): Promise<AdminIdentity> {
  const user = await requireUserPage();
  if (!isAdminRole(user.role)) redirect(HOME_PATH);
  return user as AdminIdentity;
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

/** Any signed-in user. While a one-time password is in use, only `allowPasswordChange` routes work. */
export async function requireUserApi(req: Request, opts: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  await assertSameOrigin(req);
  if (user.mustChangePassword && !opts.allowPasswordChange) {
    throw new AppError(403, "PASSWORD_CHANGE_REQUIRED", "Please set a new password before continuing");
  }
  return user;
}

/** Managers and above. */
export async function requireManagerApi(req: Request): Promise<SessionUser> {
  const user = await requireUserApi(req);
  if (!isPartyManager(user.role)) throw forbidden("Only managers and admins can do this");
  return user;
}

/** For protected API routes: validates session on every request + CSRF check for mutations. */
export async function requireAdminApi(req: Request): Promise<AdminIdentity> {
  const user = await requireUserApi(req);
  if (!isAdminRole(user.role)) throw forbidden("Only admins can do this");
  return user as AdminIdentity;
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
