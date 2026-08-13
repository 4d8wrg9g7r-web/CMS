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

export function LivestreamSetup({
  connected,
  cfAccountId,
  liveInput,
}: {
  connected: boolean;
  cfAccountId: string;
  liveInput: {
    rtmpsUrl: string | null;
    rtmpsStreamKey: string | null;
    srtUrl: string | null;
    srtStreamId: string | null;
    srtPassphrase: string | null;
    playbackEmbedUrl: string | null;
  } | null;
}) {
  const [credState, credAction, credPending] = useActionState(saveLivestreamCredentialsAction, INITIAL);
  const [inputState, inputAction, inputPending] = useActionState(createLiveInputAction, INITIAL);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card padding="md" data-section="livestream-credentials">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Plug size={15} /> Cloudflare Stream account
        </h2>
        <p className="mb-4 text-xs text-ink-muted">
          Streaming runs on your own Cloudflare Stream account (about $5/1,000 minutes watched). Create an API token
          with the <span className="font-medium">Stream:Edit</span> permission. The token is stored write-only —
          it&rsquo;s never shown again.
        </p>
        <form action={credAction} className="space-y-3">
          <label className="block text-sm text-ink-secondary">
            Account ID
            <Input name="cfAccountId" defaultValue={cfAccountId} required className="mt-1 font-mono text-xs" data-cf-account />
          </label>
          <label className="block text-sm text-ink-secondary">
            API token {connected && <span className="text-xs text-ink-muted">(saved — leave blank to keep)</span>}
            <Input name="cfApiToken" type="password" autoComplete="off" className="mt-1 font-mono text-xs" data-cf-token />
          </label>
          <button type="submit" disabled={credPending} className={buttonClasses("primary", "sm")} data-action="save-credentials">
            {credPending ? "Saving…" : connected ? "Update credentials" : "Connect Cloudflare"}
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
        {!connected ? (
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
            <div className="space-y-2 rounded-lg border border-border bg-surface-muted p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">RTMPS</p>
              <CredentialRow label="Server" value={liveInput.rtmpsUrl} />
              {liveInput.rtmpsStreamKey && <CredentialRow label="Stream key" value={liveInput.rtmpsStreamKey} secret />}
            </div>
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
            <form action={resetLiveInputAction}>
              <button type="submit" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink" data-action="reset-live-input">
                <RefreshCcw size={12} /> Start over with a new live input
              </button>
            </form>
          </div>
        )}
      </Card>

      {liveInput?.playbackEmbedUrl && (
        <Card padding="md" className="lg:col-span-2" data-section="livestream-preview">
          <h2 className="mb-3 text-sm font-semibold text-ink">Player preview</h2>
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
            <iframe
              src={liveInput.playbackEmbedUrl}
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
      )}
    </div>
  );
}
