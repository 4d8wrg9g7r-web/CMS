import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

/**
 * CMS has no marketing site — the only broadly indexable surfaces are per-org public
 * pages (/f, /e, /c, /g) whose URLs are minted per organization, so the sitemap
 * lists just the root.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
