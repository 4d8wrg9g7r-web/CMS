import { developerService, signWebhookPayload, type ClaimedEvent } from "@cms/database";

/**
 * Outbound webhook delivery (BLUEPRINT §43). The outbox handler fans a domain event out
 * into per-subscription WebhookDelivery rows (exactly-once via the outbox ledger), then
 * attempts them; the cron drain re-attempts PENDING/FAILED-under-cap deliveries so a
 * down consumer never loses events. Each POST is signed: HMAC-SHA256 over
 * "<timestamp>.<body>" with the subscription secret.
 */

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;

async function attemptOne(delivery: {
  id: string;
  organizationId: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
  subscription: { url: string; secret: string; isActive: boolean };
}) {
  if (!delivery.subscription.isActive) {
    await developerService.markDeliveryFailed(delivery.organizationId, delivery.id, "Subscription inactive");
    return;
  }

  const body = JSON.stringify({
    id: delivery.id,
    event_id: delivery.eventId,
    type: delivery.eventType,
    created_at: delivery.createdAt.toISOString(),
    data: delivery.payload,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signWebhookPayload(delivery.subscription.secret, timestamp, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const response = await fetch(delivery.subscription.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CMS-Signature": signature,
        "X-CMS-Timestamp": timestamp,
        "X-CMS-Event": delivery.eventType,
        "X-CMS-Delivery": delivery.id,
      },
      body,
      signal: controller.signal,
    });
    if (response.ok) {
      await developerService.markDelivered(delivery.organizationId, delivery.id, response.status);
    } else {
      await developerService.markDeliveryFailed(
        delivery.organizationId,
        delivery.id,
        `HTTP ${response.status}`,
        response.status,
      );
    }
  } catch (err) {
    await developerService.markDeliveryFailed(
      delivery.organizationId,
      delivery.id,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Attempt every due delivery (PENDING, or FAILED under the retry cap). */
export async function deliverAttemptableWebhooks(limit = 50): Promise<number> {
  const due = await developerService.listAttemptableDeliveries(MAX_ATTEMPTS, limit);
  for (const delivery of due) {
    await attemptOne(delivery);
  }
  return due.length;
}

/** Outbox handler: create delivery rows for matching subscriptions, then attempt them. */
export const webhookDispatchHandler = {
  name: "webhook-dispatch",
  async run(event: ClaimedEvent) {
    const created = await developerService.createDeliveries(
      event.organizationId,
      event.id,
      event.type,
      event.payload,
    );
    if (created.length > 0) await deliverAttemptableWebhooks();
  },
};
