"use server";

import { revalidatePath } from "next/cache";
import { auditService, developerService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireDeveloper } from "../../../lib/developer-access";

/**
 * Developer-platform server actions (BLUEPRINT §42/§43). api.manage enforced
 * server-side; key/subscription lifecycle audited (§47 Platform Security class).
 */

async function requireOrg() {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  return organization;
}

async function audit(organizationId: string, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({ organizationId, actorUserId: actor?.id, action, targetType, targetId, metadata });
}

/**
 * Creates a key and returns the plaintext EXACTLY ONCE for in-memory display by the
 * client component -- it is never stored or logged.
 */
export async function createApiKeyAction(
  _prev: { plaintextKey: string | null; error: string | null },
  formData: FormData,
): Promise<{ plaintextKey: string | null; error: string | null }> {
  try {
    const organization = await requireOrg();
    await requireDeveloper(organization.id, "api.manage");
    const name = String(formData.get("name") ?? "").trim() || "API key";
    const actor = await getCurrentUser();
    const { record, plaintextKey } = await developerService.createApiKey(organization.id, name, actor?.id);
    await audit(organization.id, "apikey.created", "ApiKey", record.id, { name });
    revalidatePath("/developers");
    return { plaintextKey, error: null };
  } catch (err) {
    return { plaintextKey: null, error: err instanceof Error ? err.message : "Could not create key" };
  }
}

export async function revokeApiKeyAction(apiKeyId: string) {
  const organization = await requireOrg();
  await requireDeveloper(organization.id, "api.manage");
  await developerService.revokeApiKey(organization.id, apiKeyId);
  await audit(organization.id, "apikey.revoked", "ApiKey", apiKeyId);
  revalidatePath("/developers");
}

export async function createSubscriptionAction(formData: FormData) {
  const organization = await requireOrg();
  await requireDeveloper(organization.id, "api.manage");
  const url = String(formData.get("url") ?? "").trim();
  const events = ["FormSubmitted", "PersonCreated", "EventRegistered"].filter(
    (e) => formData.get(`event_${e}`) === "on",
  );
  if (!url) throw new Error("Webhook URL is required.");
  if (events.length === 0) throw new Error("Choose at least one event.");
  const subscription = await developerService.createSubscription(organization.id, { url, events });
  await audit(organization.id, "webhook.subscription_created", "WebhookSubscription", subscription.id, { url, events });
  revalidatePath("/developers");
}

export async function setSubscriptionActiveAction(subscriptionId: string, isActive: boolean) {
  const organization = await requireOrg();
  await requireDeveloper(organization.id, "api.manage");
  await developerService.setSubscriptionActive(organization.id, subscriptionId, isActive);
  await audit(organization.id, "webhook.subscription_updated", "WebhookSubscription", subscriptionId, { isActive });
  revalidatePath("/developers");
}

export async function deleteSubscriptionAction(subscriptionId: string) {
  const organization = await requireOrg();
  await requireDeveloper(organization.id, "api.manage");
  await developerService.deleteSubscription(organization.id, subscriptionId);
  await audit(organization.id, "webhook.subscription_deleted", "WebhookSubscription", subscriptionId);
  revalidatePath("/developers");
}

export async function replayDeliveryAction(deliveryId: string) {
  const organization = await requireOrg();
  await requireDeveloper(organization.id, "api.manage");
  await developerService.replayDelivery(organization.id, deliveryId);
  await audit(organization.id, "webhook.delivery_replayed", "WebhookDelivery", deliveryId);
  revalidatePath("/developers");
}
