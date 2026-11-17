import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: bounce visitors without a session cookie away from the
 * admin panel. Real authorization happens server-side on every page and API call.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login") && !request.cookies.has("pp_session")) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
