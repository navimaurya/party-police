import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: bounce visitors without a session cookie away from the
 * admin panel. Real authorization happens server-side on every page and API call.
 */
/** Admin pages that work signed out: sign in, and the forgot-password flow. */
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/forgot-password", "/admin/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && !PUBLIC_ADMIN_PATHS.some((p) => pathname.startsWith(p)) && !request.cookies.has("pp_session")) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
