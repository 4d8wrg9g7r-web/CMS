"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { removePushSubscriptionAction, savePushSubscriptionAction } from "../../app/a/[publicAppId]/actions";

/**
 * Enable/disable lock-screen notifications for the signed-in member on THIS
 * device. Requires the app to be installed (or a browser with push support);
 * subscription is stored per device and used for announcement fan-out.
 */
export function PushToggle({ publicAppId, vapidPublicKey }: { publicAppId: string; vapidPublicKey: string }) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);
    void navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setEnabled(sub !== null);
    });
  }, []);

  if (!supported) return null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (enabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await removePushSubscriptionAction(publicAppId, sub.endpoint);
          await sub.unsubscribe();
        }
        setEnabled(false);
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Notifications were not allowed.");
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey,
        });
        const json = sub.toJSON();
        const result = await savePushSubscriptionAction(publicAppId, {
          endpoint: sub.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        });
        if (!result.ok) throw new Error(result.error ?? "Could not enable notifications");
        setEnabled(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notifications are unavailable on this device.");
    }
    setBusy(false);
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-label={enabled ? "Turn off notifications" : "Turn on notifications"}
        title={enabled ? "Notifications on" : "Get notified about announcements"}
        className={`inline-flex items-center gap-1 text-xs ${enabled ? "text-neutral-700" : "text-neutral-400 hover:text-neutral-700"}`}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : enabled ? <Bell size={13} /> : <BellOff size={13} />}
        {enabled ? "On" : "Notify me"}
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </span>
  );
}
