import { Prisma, WebhookDeliveryStatus } from "@prisma/client";
import { rawDb, tenantDb } from "../client";
import { generateApiKey, generateWebhookSecret, hashApiKey } from "../developer/helpers";

/**
 * Developer platform service (BLUEPRINT §42/§43). API keys: plaintext shown once,
 * hash-only storage, resolution via rawDb (documented bootstrapping path — no org
 * context exists until the hash matches, exactly like publicId resolution). Webhook
 * subscriptions/deliveries are tenant-scoped; the app worker performs the HTTP sends.
 */

// -- API keys ------------------------------------------------------------------

export async function createApiKey(organizationId: string, name: string, createdByUserId?: string | null) {
  const { key, hash, prefix } = await generateApiKey();
  const record = await tenantDb.apiKey.create({
    data: { organizationId, name: name.trim() || "API key", keyHash: hash, keyPrefix: prefix, createdByUserId },
  });
  // The plaintext is returned exactly once and never stored.
  return { record, plaintextKey: key };
}

export async function listApiKeys(organizationId: string) {
  return tenantDb.apiKey.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}

export async function revokeApiKey(organizationId: string, apiKeyId: string) {
  const result = await tenantDb.apiKey.updateMany({
    where: { id: apiKeyId, organizationId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

/** Resolve a presented key to its organization (null = unknown/revoked). Touches lastUsedAt. */
export async function resolveApiKey(plaintextKey: string): Promise<{ organizationId: string; apiKeyId: string } | null> {
  const hash = await hashApiKey(plaintextKey);
  const record = await rawDb.apiKey.findUnique({ where: { keyHash: hash } });
  if (!record || record.revokedAt) return null;
  // Best-effort freshness marker; never block resolution on it.
  rawDb.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { organizationId: record.organizationId, apiKeyId: record.id };
}

// -- Webhook subscriptions -----------------------------------------------------

export async function createSubscription(
  organizationId: string,
  input: { url: string; events: string[] },
) {
  const url = input.url.trim();
  if (!/^https?:\/\//.test(url)) throw new Error("Webhook URL must be http(s).");
  return tenantDb.webhookSubscription.create({
    data: {
      organizationId,
      url,
      secret: generateWebhookSecret(),
      events: input.events.filter(Boolean),
    },
  });
}

export async function listSubscriptions(organizationId: string) {
  return tenantDb.webhookSubscription.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { deliveries: true } } },
  });
}

export async function setSubscriptionActive(organizationId: string, subscriptionId: string, isActive: boolean) {
  const result = await tenantDb.webhookSubscription.updateMany({
    where: { id: subscriptionId, organizationId },
    data: { isActive },
  });
  return result.count > 0;
}

export async function deleteSubscription(organizationId: string, subscriptionId: string) {
  const result = await tenantDb.webhookSubscription.deleteMany({ where: { id: subscriptionId, organizationId } });
  return result.count > 0;
}

// -- Deliveries ----------------------------------------------------------------

/** Fan an outbox event out into PENDING delivery rows for matching active subscriptions. */
export async function createDeliveries(
  organizationId: string,
  eventId: string,
  eventType: string,
  payload: unknown,
): Promise<string[]> {
  const subscriptions = await tenantDb.webhookSubscription.findMany({
    where: { organizationId, isActive: true, events: { has: eventType } },
    select: { id: true },
  });
  if (subscriptions.length === 0) return [];
  const rows = await Promise.all(
    subscriptions.map((s) =>
      tenantDb.webhookDelivery.create({
        data: {
          organizationId,
          subscriptionId: s.id,
          eventId,
          eventType,
          payload: payload as Prisma.InputJsonValue,
          status: WebhookDeliveryStatus.PENDING,
        },
        select: { id: true },
      }),
    ),
  );
  return rows.map((r) => r.id);
}

/** Deliveries the worker should attempt: PENDING, or FAILED under the retry cap. */
export async function listAttemptableDeliveries(maxAttempts = 5, limit = 50) {
  return rawDb.webhookDelivery.findMany({
    where: {
      OR: [
        { status: WebhookDeliveryStatus.PENDING },
        { status: WebhookDeliveryStatus.FAILED, attempts: { lt: maxAttempts } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { subscription: { select: { id: true, url: true, secret: true, isActive: true } } },
  });
}

export async function markDelivered(organizationId: string, deliveryId: string, responseStatus: number) {
  await tenantDb.webhookDelivery.updateMany({
    where: { id: deliveryId, organizationId },
    data: { status: WebhookDeliveryStatus.DELIVERED, responseStatus, deliveredAt: new Date(), lastError: null,
      attempts: { increment: 1 } },
  });
}

export async function markDeliveryFailed(
  organizationId: string,
  deliveryId: string,
  error: string,
  responseStatus?: number | null,
) {
  await tenantDb.webhookDelivery.updateMany({
    where: { id: deliveryId, organizationId },
    data: {
      status: WebhookDeliveryStatus.FAILED,
      lastError: error.slice(0, 500),
      responseStatus: responseStatus ?? null,
      attempts: { increment: 1 },
    },
  });
}

export async function listDeliveries(organizationId: string, subscriptionId: string, take = 20) {
  return tenantDb.webhookDelivery.findMany({
    where: { organizationId, subscriptionId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** Replay (§43): reset a delivery so the worker attempts it again regardless of attempts. */
export async function replayDelivery(organizationId: string, deliveryId: string) {
  const result = await tenantDb.webhookDelivery.updateMany({
    where: { id: deliveryId, organizationId },
    data: { status: WebhookDeliveryStatus.PENDING, attempts: 0, lastError: null },
  });
  return result.count > 0;
}
