import { siteService, type PublicSite } from "@cms/database";
import { getCurrentOrganization } from "./session";

/**
 * Resolve a site for a /w/<publicSiteKey> request. Published sites are public.
 * Draft (unpublished) sites render only for a signed-in staff session of the
 * SAME organization — that's the Website studio's preview path; everyone else
 * gets a 404-shaped null.
 */
export async function resolveSiteForRequest(publicSiteKey: string): Promise<PublicSite | null> {
  const site = await siteService.resolvePublicSite(publicSiteKey, { preview: true });
  if (!site) return null;
  if (site.published) return site;
  const organization = await getCurrentOrganization().catch(() => null);
  return organization?.id === site.organizationId ? site : null;
}

/** Is the current session signed-in staff of the site's org? Gates studio-mode extras on /w. */
export async function isStaffOfSite(organizationId: string): Promise<boolean> {
  const organization = await getCurrentOrganization().catch(() => null);
  return organization?.id === organizationId;
}
