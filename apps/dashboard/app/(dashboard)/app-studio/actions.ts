"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { appPageService, appService, auditService } from "@cms/database";
import { getStorageProvider } from "@cms/storage";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireApp } from "../../../lib/app-access";

// Not exported: a "use server" module may only export async functions.
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Save the app design (manifest validated in the service). */
export async function saveAppAction(input: { manifest: unknown }): Promise<{ ok: boolean; error?: string }> {
  const organization = await getCurrentOrganization();
  if (!organization) return { ok: false, error: "No organization" };
  await requireApp(organization.id, "app.manage");

  try {
    await appService.saveAppManifest(organization.id, input.manifest);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the app" };
  }

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "app.updated",
    targetType: "ChurchApp",
    targetId: organization.id,
  });
  revalidatePath("/app-studio");
  return { ok: true };
}

/** Publish (or take down) the public app. Requires a saved design first. */
export async function publishAppAction(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const organization = await getCurrentOrganization();
  if (!organization) return { ok: false, error: "No organization" };
  await requireApp(organization.id, "app.manage");

  const changed = await appService.setAppEnabled(organization.id, enabled);
  if (!changed) return { ok: false, error: "Save the app design first." };

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: enabled ? "app.published" : "app.unpublished",
    targetType: "ChurchApp",
    targetId: organization.id,
  });
  revalidatePath("/app-studio");
  return { ok: true };
}

/** Show/hide the app in the container directory ("Find your church"). */
export async function toggleAppListedAction(listed: boolean): Promise<{ ok: boolean; error?: string }> {
  const organization = await getCurrentOrganization();
  if (!organization) return { ok: false, error: "No organization" };
  await requireApp(organization.id, "app.manage");

  const changed = await appService.setAppListed(organization.id, listed);
  if (!changed) return { ok: false, error: "Save the app design first." };
  revalidatePath("/app-studio");
  return { ok: true };
}

// -- Custom pages -----------------------------------------------------------------

export async function createPageAction(input: {
  title: string;
  blocks: unknown;
}): Promise<{ ok: boolean; pageId?: string; error?: string }> {
  const organization = await getCurrentOrganization();
  if (!organization) return { ok: false, error: "No organization" };
  await requireApp(organization.id, "app.manage");
  try {
    const page = await appPageService.createPage(organization.id, input);
    const actor = await getCurrentUser();
    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: actor?.id,
      action: "app.page_created",
      targetType: "AppPage",
      targetId: page.id,
      metadata: { title: page.title },
    });
    revalidatePath("/app-studio/pages");
    return { ok: true, pageId: page.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create the page" };
  }
}

export async function updatePageAction(input: {
  pageId: string;
  title: string;
  blocks: unknown;
}): Promise<{ ok: boolean; error?: string }> {
  const organization = await getCurrentOrganization();
  if (!organization) return { ok: false, error: "No organization" };
  await requireApp(organization.id, "app.manage");
  try {
    const updated = await appPageService.updatePage(organization.id, input.pageId, input);
    if (!updated) return { ok: false, error: "Page not found" };
    const actor = await getCurrentUser();
    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: actor?.id,
      action: "app.page_updated",
      targetType: "AppPage",
      targetId: input.pageId,
    });
    revalidatePath("/app-studio/pages");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the page" };
  }
}

export async function archivePageAction(pageId: string): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "app.manage");
  const archived = await appPageService.archivePage(organization.id, pageId);
  if (!archived) return;
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "app.page_archived",
    targetType: "AppPage",
    targetId: pageId,
  });
  revalidatePath("/app-studio/pages");
}

/** Custom-page graphic upload (public storage, up to 4 MB incl. GIF). */
export async function uploadPageGraphicAction(formData: FormData): Promise<{ url: string } | { error: string }> {
  const organization = await getCurrentOrganization();
  if (!organization) return { error: "No organization" };
  await requireApp(organization.id, "app.manage");

  const file = formData.get("file");
  const types = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  if (!types.has(file.type)) return { error: "Graphics must be PNG, JPEG, WebP, or GIF." };
  if (file.size > 4 * 1024 * 1024) return { error: "Graphics are capped at 4 MB." };

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
    url = `${h.get("x-forwarded-proto") ?? "http"}://${host}${url}`;
  }
  return { url };
}

/** Upload the app logo to PUBLIC storage (it renders in the public app header). */
export async function uploadAppLogoAction(formData: FormData): Promise<{ url: string } | { error: string }> {
  const organization = await getCurrentOrganization();
  if (!organization) return { error: "No organization" };
  await requireApp(organization.id, "app.manage");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  if (!LOGO_CONTENT_TYPES.has(file.type)) return { error: "Logos must be PNG, JPEG, or WebP." };
  if (file.size > LOGO_MAX_BYTES) return { error: "Logos are capped at 2 MB." };

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
    if (!host) return { error: "Could not determine the site URL for the logo." };
    url = `${h.get("x-forwarded-proto") ?? "http"}://${host}${url}`;
  }
  return { url };
}
