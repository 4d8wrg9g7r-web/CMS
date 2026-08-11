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
