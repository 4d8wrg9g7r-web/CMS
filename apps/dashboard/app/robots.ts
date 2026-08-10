import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

/**
 * Disallows everything behind auth (dashboard, API, account flows) -- only a
 * church's own public surfaces (/f forms, /e events, /c calendar, /g groups) are
 * meant to be indexed.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/people",
        "/groups",
        "/journeys",
        "/events",
        "/serving",
        "/forms",
        "/workflows",
        "/tasks",
        "/messages",
        "/developers",
        "/team",
        "/settings",
        "/audit-log",
        "/onboarding",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
