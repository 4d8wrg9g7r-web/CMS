"use server";

import { revalidatePath } from "next/cache";
import { auditService, livestreamService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireApp } from "../../../lib/app-access";
import { createLiveInput } from "../../../lib/cloudflare-stream";

export interface LivestreamFormState {
  error: string | null;
  ok?: boolean;
}

async function audit(organizationId: string, action: string, metadata?: Record<string, unknown>) {
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId,
    actorUserId: actor?.id,
    action,
    targetType: "Organization",
    targetId: organizationId,
    metadata,
  });
}

/** Save Cloudflare credentials (token write-only: blank keeps the stored one). */
export async function saveLivestreamCredentialsAction(
  _prev: LivestreamFormState,
  formData: FormData,
): Promise<LivestreamFormState> {
  const organization = await getCurrentOrganization();
  if (!organization) return { error: "No organization" };
  await requireApp(organization.id, "app.manage");
  try {
    await livestreamService.saveLivestreamCredentials(organization.id, {
      cfAccountId: String(formData.get("cfAccountId") ?? ""),
      cfApiToken: String(formData.get("cfApiToken") ?? ""),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save" };
  }
  await audit(organization.id, "livestream.credentials_saved");
  revalidatePath("/livestream");
  return { error: null, ok: true };
}

/** Create the Cloudflare live input and store its ingest credentials. */
export async function createLiveInputAction(_prev: LivestreamFormState, _formData: FormData): Promise<LivestreamFormState> {
  const organization = await getCurrentOrganization();
  if (!organization) return { error: "No organization" };
  await requireApp(organization.id, "app.manage");

  const config = await livestreamService.getLivestreamConfig(organization.id);
  if (!config) return { error: "Connect your Cloudflare account first." };

  try {
    const input = await createLiveInput(config.cfAccountId, config.cfApiToken, `${organization.name} livestream`);
    await livestreamService.saveLiveInput(organization.id, input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the live input." };
  }
  await audit(organization.id, "livestream.live_input_created");
  revalidatePath("/livestream");
  return { error: null, ok: true };
}

export async function resetLiveInputAction(): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "app.manage");
  await livestreamService.clearLiveInput(organization.id);
  await audit(organization.id, "livestream.live_input_cleared");
  revalidatePath("/livestream");
}

export async function disconnectLivestreamAction(): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "app.manage");
  await livestreamService.disconnectLivestream(organization.id);
  await audit(organization.id, "livestream.disconnected");
  revalidatePath("/livestream");
}
