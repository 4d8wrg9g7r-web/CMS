"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auditService, siteService } from "@cms/database";
import { getStorageProvider } from "@cms/storage";
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

const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * Upload a website image (hero background, text+image art, team photo) to
 * PUBLIC storage — the public site serves images by URL, so like newsletter
 * images these cannot live in the private bucket. Returns an absolute
 * http(s) URL ready for a section's imageUrl field; local-dev uploads land
 * under public/uploads and are absolutized from the request origin.
 */
export async function uploadSiteImageAction(formData: FormData): Promise<{ url: string } | { error: string }> {
  const organization = await authorize();
  if (!organization) return { error: "No organization" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  if (!IMAGE_CONTENT_TYPES.has(file.type)) return { error: "Images must be PNG, JPEG, GIF, or WebP." };
  if (file.size > IMAGE_MAX_BYTES) return { error: "Images are capped at 4 MB." };

  const saved = await getStorageProvider(path.join(process.cwd(), "public")).saveFile({
    organizationId: organization.id,
    fileName: file.name,
    contentType: file.type,
    data: Buffer.from(await file.arrayBuffer()),
  });

  let url = saved.url;
  if (url.startsWith("/")) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return { error: "Could not determine the site URL for the image." };
    const proto = h.get("x-forwarded-proto") ?? "http";
    url = `${proto}://${host}${url}`;
  }
  await audit(organization.id, "site.image_uploaded", organization.id);
  return { url };
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
