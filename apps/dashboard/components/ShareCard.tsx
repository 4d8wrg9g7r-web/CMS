"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import QRCode from "qrcode";
import { Bell, Check, Code2, Copy, Download, ExternalLink, Share2 } from "lucide-react";
import { Input, Select } from "./ui/Input";
import { buttonClasses } from "./ui/Button";
import { useToast } from "./ui/Toast";
import { sendItemPushAction } from "../app/(dashboard)/share-actions";

/**
 * The one share box (docs/design-system.md "Share"): QR code (downloadable),
 * view + copy link, iframe embed code, and — for staff with app.manage — a
 * push notification to every subscribed app member. Multiple variants (e.g.
 * a site's pages) share through one card via the select.
 */
export function ShareCard({
  itemTitle,
  variants,
  embed = true,
  canNotify = false,
}: {
  /** What's being shared — prefills the push title. */
  itemTitle: string;
  /** One or more URLs; the select appears only when there are several. */
  variants: { label: string; url: string }[];
  embed?: boolean;
  canNotify?: boolean;
}) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState(0);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const url = variants[Math.min(selected, variants.length - 1)]?.url ?? "";

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 240 })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [url]);

  const embedCode = useMemo(
    () => `<iframe src="${url}" width="100%" height="640" style="border:0;border-radius:12px" loading="lazy"></iframe>`,
    [url]
  );

  const copy = async (text: string, which: "link" | "embed") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      showToast("Couldn't copy — select and copy manually", "error");
    }
  };

  const notify = (formData: FormData) => {
    startTransition(async () => {
      try {
        await sendItemPushAction(formData);
        showToast("Notification sent to app subscribers", "success");
        setNotifyOpen(false);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Could not send", "error");
      }
    });
  };

  return (
    <div data-section="share-card">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Share2 size={15} /> Share
      </h2>

      {variants.length > 1 && (
        <Select
          value={String(selected)}
          onChange={(e) => setSelected(Number(e.target.value))}
          className="mb-3 w-full py-2 text-sm"
          aria-label="What to share"
        >
          {variants.map((v, i) => (
            <option key={i} value={i}>
              {v.label}
            </option>
          ))}
        </Select>
      )}

      <div className="flex items-start gap-4">
        <div className="shrink-0">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL
            <img src={qr} alt="QR code" width={104} height={104} className="rounded-md border border-border" data-share-qr />
          ) : (
            <div className="h-[104px] w-[104px] rounded-md border border-border bg-surface-muted" />
          )}
          {qr && (
            <a
              href={qr}
              download="qr-code.png"
              className="mt-1 flex items-center justify-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              <Download size={11} /> Download
            </a>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate rounded-md border border-border bg-surface-muted px-2.5 py-1.5 text-xs text-ink-secondary" title={url}>
            {url}
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={url} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "sm")} data-share-view>
              <ExternalLink size={13} /> View
            </a>
            <button type="button" onClick={() => copy(url, "link")} className={buttonClasses("secondary", "sm")} data-share-copy>
              {copied === "link" ? <Check size={13} className="text-success" /> : <Copy size={13} />} Copy link
            </button>
            {embed && (
              <button
                type="button"
                onClick={() => copy(embedCode, "embed")}
                className={buttonClasses("secondary", "sm")}
                data-share-embed
              >
                {copied === "embed" ? <Check size={13} className="text-success" /> : <Code2 size={13} />} Embed code
              </button>
            )}
            {canNotify && (
              <button
                type="button"
                onClick={() => setNotifyOpen((o) => !o)}
                className={buttonClasses("secondary", "sm")}
                aria-expanded={notifyOpen}
                data-share-notify
              >
                <Bell size={13} /> Notify app users
              </button>
            )}
          </div>
        </div>
      </div>

      {canNotify && notifyOpen && (
        <form action={notify} className="mt-3 space-y-2 rounded-lg border border-border bg-surface-muted p-3" data-share-notify-form>
          <input type="hidden" name="url" value={url} />
          <Input name="title" defaultValue={itemTitle} maxLength={120} aria-label="Notification title" className="bg-surface" />
          <Input
            name="body"
            placeholder="One line about why this matters (optional)"
            maxLength={300}
            aria-label="Notification body"
            className="bg-surface"
          />
          <button type="submit" disabled={isPending} className={buttonClasses("primary", "sm")} data-share-notify-send>
            {isPending ? "Sending…" : "Send notification"}
          </button>
        </form>
      )}
    </div>
  );
}
