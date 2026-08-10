import { NextResponse } from "next/server";
import { auth } from "./auth";

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

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
    "/serving/:path*",
    "/forms/:path*",
    "/workflows/:path*",
    "/tasks/:path*",
    "/messages/:path*",
    "/team",
    "/audit-log",
    "/developers/:path*",
    "/settings",
  ],
};
