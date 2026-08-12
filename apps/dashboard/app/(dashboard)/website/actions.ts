"use server";

import { revalidatePath } from "next/cache";
import { auditService, siteService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireApp } from "../../../lib/app-access";

/**
 * Website studio actions (docs/domain/website.md). Managing the website is the
 * same digital-presence responsibility as App Studio, so it shares the
 * app.manage permission. Every mutation is audited.
 */

async function authorize() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireApp(organization.id, "app.manage");
  return organization;
}

async function audit(organizationId: string, action: string, targetId: string) {
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId,
    actorUserId: actor?.id,
    action,
    targetType: "Site",
    targetId,
  });
}

export async function saveSiteConfigAction(input: { config: unknown }): Promise<{ ok: boolean; error?: string }> {
  const organization = await authorize();
  if (!organization) return { ok: false, error: "No organization" };
  await siteService.updateSiteConfig(organization.id, input.config, organization.name);
  await audit(organization.id, "site.config_updated", organization.id);
  revalidatePath("/website");
  return { ok: true };
}

export async function publishSiteAction(published: boolean): Promise<{ ok: boolean; error?: string }> {
  const organization = await authorize();
  if (!organization) return { ok: false, error: "No organization" };
  await siteService.setSitePublished(organization.id, published);
  await audit(organization.id, published ? "site.published" : "site.unpublished", organization.id);
  revalidatePath("/website");
  return { ok: true };
}

export async function createSitePageAction(input: {
  slug: string;
  title: string;
}): Promise<{ ok: boolean; error?: string; pageId?: string }> {
  const organization = await authorize();
  if (!organization) return { ok: false, error: "No organization" };
  const result = await siteService.createPage(organization.id, input);
  if (!result.ok) return result;
  await audit(organization.id, "site.page_created", result.pageId);
  revalidatePath("/website");
  return { ok: true, pageId: result.pageId };
}

export async function updateSitePageAction(input: {
  pageId: string;
  title?: string;
  inNav?: boolean;
  sortOrder?: number;
  sections?: unknown;
}): Promise<{ ok: boolean; error?: string }> {
  const organization = await authorize();
  if (!organization) return { ok: false, error: "No organization" };
  const result = await siteService.updatePage(organization.id, input.pageId, input);
  if (!result.ok) return result;
  await audit(organization.id, "site.page_updated", input.pageId);
  revalidatePath("/website");
  revalidatePath(`/website/pages/${input.pageId}`);
  return { ok: true };
}

export async function deleteSitePageAction(pageId: string): Promise<{ ok: boolean; error?: string }> {
  const organization = await authorize();
  if (!organization) return { ok: false, error: "No organization" };
  const result = await siteService.deletePage(organization.id, pageId);
  if (!result.ok) return result;
  await audit(organization.id, "site.page_deleted", pageId);
  revalidatePath("/website");
  return { ok: true };
}
