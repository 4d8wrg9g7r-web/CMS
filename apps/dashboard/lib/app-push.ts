import webpush from "web-push";
import { appPushService } from "@cms/database";

/**
 * Web-push sender for the church app (ADR-013, docs/domain/app.md). Gated on
 * VAPID env keys — without them every call is a silent no-op so local dev and
 * unconfigured deployments never break. Dead endpoints (404/410) are pruned.
 */

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

export async function sendAppPush(organizationId: string, payload: AppPushPayload): Promise<void> {
  if (!webPushAvailable()) return;
  webpush.setVapidDetails(
    process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:support@example.org",
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY!,
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY!,
  );

  const subscriptions = await appPushService.listSubscriptions(organizationId);
  const dead: string[] = [];
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
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
  await appPushService.deleteByEndpoints(organizationId, dead);
}
