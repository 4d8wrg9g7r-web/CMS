"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Plug, Radio, RefreshCcw, Unplug } from "lucide-react";
import { Card } from "./ui/Card";
import { Input } from "./ui/Input";
import { buttonClasses } from "./ui/Button";
import {
  createLiveInputAction,
  disconnectLivestreamAction,
  resetLiveInputAction,
  saveLivestreamCredentialsAction,
  saveManualStreamAction,
  type LivestreamFormState,
} from "../app/(dashboard)/livestream/actions";

const INITIAL: LivestreamFormState = { error: null };

function CredentialRow({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(!secret);
  return (
    <div className="flex items-center gap-2" data-credential={label}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        <p className="truncate font-mono text-xs text-ink" title={revealed ? value : undefined}>
          {revealed ? value : "••••••••••••••••"}
        </p>
      </div>
      {secret && (
        <button type="button" onClick={() => setRevealed((r) => !r)} className="text-xs text-accent hover:underline">
          {revealed ? "Hide" : "Reveal"}
        </button>
      )}
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* the row stays selectable */
          }
        }}
        aria-label={`Copy ${label}`}
        className="p-1 text-ink-muted hover:text-ink"
      >
        {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export interface LiveInputView {
  rtmpsUrl: string | null;
  rtmpsStreamKey: string | null;
  srtUrl: string | null;
  srtStreamId: string | null;
  srtPassphrase: string | null;
  playbackEmbedUrl: string | null;
}

function IngestCredentials({ liveInput }: { liveInput: LiveInputView }) {
  return (
    <div className="space-y-3">
      {liveInput.rtmpsUrl && (
        <div className="space-y-2 rounded-lg border border-border bg-surface-muted p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">RTMPS</p>
          <CredentialRow label="Server" value={liveInput.rtmpsUrl} />
          {liveInput.rtmpsStreamKey && <CredentialRow label="Stream key" value={liveInput.rtmpsStreamKey} secret />}
        </div>
      )}
      {liveInput.srtUrl && (
        <div className="space-y-2 rounded-lg border border-border bg-surface-muted p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">SRT</p>
          <CredentialRow label="URL" value={liveInput.srtUrl} />
          {liveInput.srtStreamId && <CredentialRow label="Stream ID" value={liveInput.srtStreamId} />}
          {liveInput.srtPassphrase && <CredentialRow label="Passphrase" value={liveInput.srtPassphrase} secret />}
        </div>
      )}
      {liveInput.playbackEmbedUrl && (
        <div className="space-y-2 rounded-lg border border-border bg-surface-muted p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Watch page</p>
          <CredentialRow label="Player URL — paste into your app's Livestream tab and website" value={liveInput.playbackEmbedUrl} />
        </div>
      )}
    </div>
  );
}

export function LivestreamSetup({
  mode,
  connected,
  cfAccountId,
  liveInput,
  playbackFrameUrl,
}: {
  /** Stored mode, or null when nothing is configured yet. */
  mode: "MANUAL" | "CLOUDFLARE" | null;
  connected: boolean;
  cfAccountId: string;
  liveInput: LiveInputView | null;
  /** Embed-safe player URL derived server-side (null = can't inline-preview). */
  playbackFrameUrl: string | null;
}) {
  const [credState, credAction, credPending] = useActionState(saveLivestreamCredentialsAction, INITIAL);
  const [inputState, inputAction, inputPending] = useActionState(createLiveInputAction, INITIAL);
  const [manualState, manualAction, manualPending] = useActionState(saveManualStreamAction, INITIAL);
  const [tab, setTab] = useState<"MANUAL" | "CLOUDFLARE">(mode ?? "MANUAL");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2" data-section="livestream-mode">
        {(
          [
            { key: "MANUAL", label: "I already have a stream" },
            { key: "CLOUDFLARE", label: "Create a stream endpoint for me" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${
              tab === t.key
                ? "border-accent bg-accent font-semibold text-white"
                : "border-border bg-surface text-ink-secondary hover:text-ink"
            }`}
            data-mode-tab={t.key}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "MANUAL" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card padding="md" data-section="livestream-manual">
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Radio size={15} /> Your existing stream
            </h2>
            <p className="mb-4 text-xs text-ink-muted">
              Enter the stream you already run. The watch URL is what plays in your app and website (YouTube Live,
              Vimeo, or a Cloudflare Stream player link); the RTMPS/SRT details are kept here as the reference card
              for whoever runs your encoder.
            </p>
            <form action={manualAction} className="space-y-3">
              <label className="block text-sm text-ink-secondary">
                Watch / embed URL
                <Input
                  name="playbackEmbedUrl"
                  defaultValue={mode === "MANUAL" ? (liveInput?.playbackEmbedUrl ?? "") : ""}
                  placeholder="https://youtube.com/live/…"
                  className="mt-1 font-mono text-xs"
                  data-manual-playback
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-ink-secondary">
                  RTMPS server
                  <Input name="rtmpsUrl" defaultValue={mode === "MANUAL" ? (liveInput?.rtmpsUrl ?? "") : ""} placeholder="rtmps://…" className="mt-1 font-mono text-xs" data-manual-rtmps />
                </label>
                <label className="block text-sm text-ink-secondary">
                  RTMPS stream key
                  <Input name="rtmpsStreamKey" type="password" autoComplete="off" defaultValue={mode === "MANUAL" ? (liveInput?.rtmpsStreamKey ?? "") : ""} className="mt-1 font-mono text-xs" />
                </label>
                <label className="block text-sm text-ink-secondary">
                  SRT URL
                  <Input name="srtUrl" defaultValue={mode === "MANUAL" ? (liveInput?.srtUrl ?? "") : ""} placeholder="srt://…" className="mt-1 font-mono text-xs" />
                </label>
                <label className="block text-sm text-ink-secondary">
                  SRT stream ID
                  <Input name="srtStreamId" defaultValue={mode === "MANUAL" ? (liveInput?.srtStreamId ?? "") : ""} className="mt-1 font-mono text-xs" />
                </label>
                <label className="block text-sm text-ink-secondary sm:col-span-2">
                  SRT passphrase
                  <Input name="srtPassphrase" type="password" autoComplete="off" defaultValue={mode === "MANUAL" ? (liveInput?.srtPassphrase ?? "") : ""} className="mt-1 font-mono text-xs" />
                </label>
              </div>
              <button type="submit" disabled={manualPending} className={buttonClasses("primary", "sm")} data-action="save-manual-stream">
                {manualPending ? "Saving…" : "Save stream"}
              </button>
              {manualState.error && <p className="text-sm text-danger" data-manual-error>{manualState.error}</p>}
              {manualState.ok && !manualState.error && <p className="text-sm text-success">Saved.</p>}
            </form>
          </Card>

          {mode === "MANUAL" && liveInput && (
            <Card padding="md" data-section="livestream-manual-summary">
              <h2 className="mb-3 text-sm font-semibold text-ink">Stream reference</h2>
              <IngestCredentials liveInput={liveInput} />
            </Card>
          )}
        </div>
      )}

      {tab === "CLOUDFLARE" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card padding="md" data-section="livestream-credentials">
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Plug size={15} /> Cloudflare Stream account
            </h2>
            <p className="mb-4 text-xs text-ink-muted">
              Don&rsquo;t have a streaming provider? We can create an ingest endpoint on your own Cloudflare Stream
              account (about $5/1,000 minutes watched). The API token needs the{" "}
              <span className="font-medium">Stream:Edit</span> permission and is stored write-only.
            </p>
            <form action={credAction} className="space-y-3">
              <label className="block text-sm text-ink-secondary">
                Account ID
                <Input name="cfAccountId" defaultValue={cfAccountId} required className="mt-1 font-mono text-xs" data-cf-account />
              </label>
              <label className="block text-sm text-ink-secondary">
                API token {connected && mode === "CLOUDFLARE" && <span className="text-xs text-ink-muted">(saved — leave blank to keep)</span>}
                <Input name="cfApiToken" type="password" autoComplete="off" className="mt-1 font-mono text-xs" data-cf-token />
              </label>
              <button type="submit" disabled={credPending} className={buttonClasses("primary", "sm")} data-action="save-credentials">
                {credPending ? "Saving…" : mode === "CLOUDFLARE" ? "Update credentials" : "Connect Cloudflare"}
              </button>
              {credState.error && <p className="text-sm text-danger" data-credentials-error>{credState.error}</p>}
              {credState.ok && !credState.error && <p className="text-sm text-success">Saved.</p>}
            </form>
            {connected && (
              <form action={disconnectLivestreamAction} className="mt-3">
                <button type="submit" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-danger">
                  <Unplug size={12} /> Disconnect
                </button>
              </form>
            )}
          </Card>

          <Card padding="md" data-section="livestream-ingest">
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Radio size={15} /> Ingest
            </h2>
            {mode !== "CLOUDFLARE" ? (
              <p className="text-sm text-ink-muted">Connect your Cloudflare account first.</p>
            ) : !liveInput?.rtmpsUrl ? (
              <>
                <p className="mb-4 text-xs text-ink-muted">
                  Create a live input to get RTMPS and SRT credentials for your encoder (OBS, ATEM, vMix…).
                </p>
                <form action={inputAction}>
                  <button type="submit" disabled={inputPending} className={buttonClasses("primary", "sm")} data-action="create-live-input">
                    {inputPending ? "Creating…" : "Create live input"}
                  </button>
                  {inputState.error && <p className="mt-2 text-sm text-danger" data-ingest-error>{inputState.error}</p>}
                </form>
              </>
            ) : (
              <div className="space-y-3">
                <IngestCredentials liveInput={liveInput} />
                <form action={resetLiveInputAction}>
                  <button type="submit" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink" data-action="reset-live-input">
                    <RefreshCcw size={12} /> Start over with a new live input
                  </button>
                </form>
              </div>
            )}
          </Card>
        </div>
      )}

      {playbackFrameUrl ? (
        <Card padding="md" data-section="livestream-preview">
          <h2 className="mb-3 text-sm font-semibold text-ink">Player preview</h2>
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
            <iframe
              src={playbackFrameUrl}
              title="Livestream preview"
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Shows &ldquo;stream is offline&rdquo; until your encoder is sending — that means everything is wired up.
          </p>
        </Card>
      ) : liveInput?.playbackEmbedUrl ? (
        <Card padding="md" data-section="livestream-preview">
          <h2 className="mb-2 text-sm font-semibold text-ink">Player preview</h2>
          <p className="text-sm text-ink-secondary">
            This watch URL can&rsquo;t be previewed inline — the app and website will show a{" "}
            <a href={liveInput.playbackEmbedUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              watch link
            </a>{" "}
            instead. YouTube Live, Vimeo, and Cloudflare Stream player URLs embed inline.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
