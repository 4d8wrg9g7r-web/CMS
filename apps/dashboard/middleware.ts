import { NextRequest, NextResponse } from "next/server";

/**
 * UX-level gate only: presence of the NextAuth session cookie decides whether to
 * bounce to /login. Deliberately does NOT import ./auth — that would pull next-auth
 * (and, through the Credentials provider, the database package) into the Edge bundle,
 * and NextAuth's env parsing crashes the whole middleware on a malformed NEXTAUTH_URL.
 * Real authentication/authorization happens server-side on every page and action via
 * lib/session.ts; a forged cookie gets past this redirect but never past those.
 */
const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

export function middleware(req: NextRequest) {
  const hasSessionCookie = SESSION_COOKIES.some((name) => req.cookies.has(name));
  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

// Only the authenticated dashboard surface is protected here. The public surfaces
// (/f forms, /e event registration, /c calendar, /g group finder) and the public
// API routes are intentionally NOT matched -- they have no session and are scoped
// entirely by publicId / API-key resolution (build-plan decision).
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding",
    "/people/:path*",
    "/groups/:path*",
    "/journeys/:path*",
    "/events/:path*",
    "/attendance",
    "/reports",
    "/giving/:path*",
    "/serving/:path*",
    "/forms/:path*",
    "/workflows/:path*",
    "/tasks/:path*",
    "/messages/:path*",
    "/website/:path*",
    "/team",
    "/audit-log",
    "/developers/:path*",
    "/settings",
  ],
};
