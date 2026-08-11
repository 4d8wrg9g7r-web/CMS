import webpush from "web-push";
import { appPushService } from "@cms/database";

/**
 * Push sender for the church app (ADR-013, docs/domain/app.md), fanning out to
 * both device kinds:
 *   - webpush: browser subscriptions via the web-push lib — gated on VAPID env
 *     keys (absent keys → that half is a silent no-op); 404/410 prunes.
 *   - expo: native app tokens via Expo's push API (no keys required); batched
 *     100 per request; DeviceNotRegistered prunes.
 * Failures on one channel never block the other.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH = 100;

export function webPushAvailable(): boolean {
  return Boolean(process.env.WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY);
}

export function webPushPublicKey(): string | null {
  return process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null;
}

export interface AppPushPayload {
  title: string;
  body: string;
  /** Absolute or app-relative URL opened when the notification is tapped. */
  url: string;
}

interface Subscription {
  kind: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
}

async function sendWebPush(subscriptions: Subscription[], payload: AppPushPayload): Promise<string[]> {
  if (subscriptions.length === 0 || !webPushAvailable()) return [];
  webpush.setVapidDetails(
    process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:support@example.org",
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY!,
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY!,
  );
  const dead: string[] = [];
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh ?? "", auth: sub.auth ?? "" } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(sub.endpoint);
        else console.error("Web push send failed:", status ?? err);
      }
    }),
  );
  return dead;
}

async function sendExpoPush(subscriptions: Subscription[], payload: AppPushPayload): Promise<string[]> {
  if (subscriptions.length === 0) return [];
  const dead: string[] = [];
  for (let i = 0; i < subscriptions.length; i += EXPO_BATCH) {
    const batch = subscriptions.slice(i, i + EXPO_BATCH);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(
          batch.map((sub) => ({
            to: sub.endpoint,
            title: payload.title,
            body: payload.body,
            data: { url: payload.url },
            sound: "default",
          })),
        ),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { status: string; details?: { error?: string } }[];
      } | null;
      json?.data?.forEach((ticket, index) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          const sub = batch[index];
          if (sub) dead.push(sub.endpoint);
        }
      });
    } catch (err) {
      console.error("Expo push batch failed:", err);
    }
  }
  return dead;
}

async function fanOut(organizationId: string, subscriptions: Subscription[], payload: AppPushPayload): Promise<void> {
  if (subscriptions.length === 0) return;
  const [deadWeb, deadExpo] = await Promise.all([
    sendWebPush(subscriptions.filter((s) => s.kind === "webpush"), payload),
    sendExpoPush(subscriptions.filter((s) => s.kind === "expo"), payload),
  ]);
  await appPushService.deleteByEndpoints(organizationId, [...deadWeb, ...deadExpo]);
}

/** Push to every subscribed member of the org (church-wide announcements). */
export async function sendAppPush(organizationId: string, payload: AppPushPayload): Promise<void> {
  await fanOut(organizationId, await appPushService.listSubscriptions(organizationId), payload);
}

/** Push to specific people only (e.g. one group's members). */
export async function sendAppPushToPeople(
  organizationId: string,
  personIds: string[],
  payload: AppPushPayload,
): Promise<void> {
  if (personIds.length === 0) return;
  await fanOut(organizationId, await appPushService.listSubscriptionsForPeople(organizationId, personIds), payload);
}
