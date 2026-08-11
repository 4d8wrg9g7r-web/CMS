import { tenantDb } from "../client";

/**
 * Web-push subscriptions for church-app members (docs/domain/app.md). A row is
 * one browser/device subscription for a signed-in member; endpoints are unique
 * per subscription. Sending happens in the app layer (web-push provider);
 * this service only stores and prunes.
 */

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function saveSubscription(organizationId: string, personId: string, input: PushSubscriptionInput) {
  const endpoint = input.endpoint.trim();
  if (!/^https:\/\//.test(endpoint)) throw new Error("Invalid push endpoint.");
  if (!input.p256dh || !input.auth) throw new Error("Invalid push keys.");

  // A browser re-subscribing reuses the endpoint: adopt the row for the current member.
  const existing = await tenantDb.appPushSubscription.findFirst({
    where: { organizationId, endpoint },
    select: { id: true },
  });
  if (existing) {
    await tenantDb.appPushSubscription.updateMany({
      where: { id: existing.id, organizationId },
      data: { personId, p256dh: input.p256dh, auth: input.auth },
    });
    return existing.id;
  }
  const created = await tenantDb.appPushSubscription.create({
    data: { organizationId, personId, endpoint, p256dh: input.p256dh, auth: input.auth },
  });
  return created.id;
}

const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]\s]+\]$/;

/** Native device registration: the Expo push token is the endpoint (kind "expo"). */
export async function saveExpoToken(organizationId: string, personId: string, token: string) {
  const endpoint = token.trim();
  if (!EXPO_TOKEN.test(endpoint)) throw new Error("Invalid Expo push token.");

  const existing = await tenantDb.appPushSubscription.findFirst({
    where: { organizationId, endpoint },
    select: { id: true },
  });
  if (existing) {
    await tenantDb.appPushSubscription.updateMany({
      where: { id: existing.id, organizationId },
      data: { personId, kind: "expo" },
    });
    return existing.id;
  }
  const created = await tenantDb.appPushSubscription.create({
    data: { organizationId, personId, kind: "expo", endpoint },
  });
  return created.id;
}

export async function removeSubscription(organizationId: string, personId: string, endpoint: string) {
  await tenantDb.appPushSubscription.deleteMany({ where: { organizationId, personId, endpoint } });
}

export async function listSubscriptions(organizationId: string) {
  return tenantDb.appPushSubscription.findMany({
    where: { organizationId },
    select: { id: true, kind: true, endpoint: true, p256dh: true, auth: true },
  });
}

/** Subscriptions for a specific set of people — targeted sends (e.g. one group). */
export async function listSubscriptionsForPeople(organizationId: string, personIds: string[]) {
  if (personIds.length === 0) return [];
  return tenantDb.appPushSubscription.findMany({
    where: { organizationId, personId: { in: personIds } },
    select: { id: true, kind: true, endpoint: true, p256dh: true, auth: true },
  });
}

export async function hasSubscription(organizationId: string, personId: string): Promise<boolean> {
  const row = await tenantDb.appPushSubscription.findFirst({
    where: { organizationId, personId },
    select: { id: true },
  });
  return row !== null;
}

/** Prune endpoints the push service reported dead (404/410). */
export async function deleteByEndpoints(organizationId: string, endpoints: string[]) {
  if (endpoints.length === 0) return;
  await tenantDb.appPushSubscription.deleteMany({ where: { organizationId, endpoint: { in: endpoints } } });
}
