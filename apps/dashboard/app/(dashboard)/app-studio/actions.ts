"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { appService, auditService } from "@cms/database";
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
