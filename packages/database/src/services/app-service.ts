import { Prisma } from "@prisma/client";
import { rawDb, tenantDb } from "../client";
import { validateAppManifest, type AppManifest } from "../app/manifest";

/**
 * Church-app service (docs/domain/app.md): one ChurchApp row per org holding the
 * validated manifest. The public /a/<publicAppId> surface resolves by publicAppId
 * with rawDb — the documented bootstrapping exception, same as forms/public-site
 * resolution — and only while `enabled`.
 */

export async function getChurchApp(organizationId: string) {
  return tenantDb.churchApp.findFirst({ where: { organizationId } });
}

/** Upsert the manifest (validated); creating starts disabled until first publish. */
export async function saveAppManifest(organizationId: string, input: unknown) {
  const validated = validateAppManifest(input);
  if (!validated.ok) throw new Error(validated.error);

  const existing = await tenantDb.churchApp.findFirst({ where: { organizationId }, select: { id: true } });
  if (existing) {
    await tenantDb.churchApp.updateMany({
      where: { id: existing.id, organizationId },
      data: { config: validated.manifest as unknown as Prisma.InputJsonValue },
    });
  } else {
    await tenantDb.churchApp.create({
      data: { organizationId, config: validated.manifest as unknown as Prisma.InputJsonValue },
    });
  }
  return getChurchApp(organizationId);
}

export async function setAppEnabled(organizationId: string, enabled: boolean) {
  const result = await tenantDb.churchApp.updateMany({ where: { organizationId }, data: { enabled } });
  return result.count > 0;
}

/** Show/hide the app in the container directory (direct links keep working). */
export async function setAppListed(organizationId: string, listed: boolean) {
  const result = await tenantDb.churchApp.updateMany({
    where: { organizationId },
    data: { listedInDirectory: listed },
  });
  return result.count > 0;
}

export interface DirectoryEntry {
  publicAppId: string;
  appName: string;
  themeColor: string;
  logoUrl: string | null;
  organizationName: string;
}

/**
 * The container app's "find your church" search: enabled + listed apps whose
 * app or organization name matches. Public boundary (rawDb, like
 * resolvePublicApp); invalid stored manifests are skipped, never surfaced.
 */
export async function searchDirectory(query?: string): Promise<DirectoryEntry[]> {
  const q = query?.trim();
  const apps = await rawDb.churchApp.findMany({
    where: {
      enabled: true,
      listedInDirectory: true,
      ...(q ? { organization: { name: { contains: q, mode: "insensitive" } } } : {}),
    },
    include: { organization: { select: { name: true } } },
    orderBy: { organization: { name: "asc" } },
    take: 50,
  });

  const entries: DirectoryEntry[] = [];
  for (const app of apps) {
    const validated = validateAppManifest(app.config);
    if (!validated.ok) continue;
    entries.push({
      publicAppId: app.publicAppId,
      appName: validated.manifest.appName,
      themeColor: validated.manifest.themeColor,
      logoUrl: validated.manifest.logoUrl,
      organizationName: app.organization.name,
    });
  }
  // Church name OR app name match: the query above narrows on org name for the
  // common case; app-name matches are folded in here without a second query.
  if (q) {
    const lower = q.toLowerCase();
    const missing = await rawDb.churchApp.findMany({
      where: { enabled: true, listedInDirectory: true },
      include: { organization: { select: { name: true } } },
      take: 200,
    });
    for (const app of missing) {
      if (entries.some((e) => e.publicAppId === app.publicAppId)) continue;
      const validated = validateAppManifest(app.config);
      if (!validated.ok || !validated.manifest.appName.toLowerCase().includes(lower)) continue;
      entries.push({
        publicAppId: app.publicAppId,
        appName: validated.manifest.appName,
        themeColor: validated.manifest.themeColor,
        logoUrl: validated.manifest.logoUrl,
        organizationName: app.organization.name,
      });
    }
    entries.sort((a, b) => a.organizationName.localeCompare(b.organizationName));
  }
  return entries.slice(0, 50);
}

export interface PublicApp {
  organizationId: string;
  organizationName: string;
  publicSiteId: string;
  manifest: AppManifest;
}

/** Public resolution for /a/<id>: enabled apps only; invalid stored manifests 404. */
export async function resolvePublicApp(publicAppId: string): Promise<PublicApp | null> {
  const app = await rawDb.churchApp.findUnique({
    where: { publicAppId },
    include: { organization: { select: { id: true, name: true, publicSiteId: true } } },
  });
  if (!app || !app.enabled) return null;
  const validated = validateAppManifest(app.config);
  if (!validated.ok) return null;
  return {
    organizationId: app.organization.id,
    organizationName: app.organization.name,
    publicSiteId: app.organization.publicSiteId,
    manifest: validated.manifest,
  };
}
