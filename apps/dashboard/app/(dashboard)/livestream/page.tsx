import { Lock, Radio } from "lucide-react";
import { livestreamService, videoEmbedUrl } from "@cms/database";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LivestreamSetup } from "../../../components/LivestreamSetup";
import { canApp } from "../../../lib/app-access";
import { getCurrentOrganization } from "../../../lib/session";

/**
 * Livestream (docs/domain/app.md). Two paths: enter an existing stream's
 * credentials + watch URL directly (default), or create an ingest endpoint
 * through the church's own Cloudflare Stream account.
 */
export default async function LivestreamPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canApp(organization.id, "app.manage"))) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to Livestream setup" description="" />
      </Card>
    );
  }

  const config = await livestreamService.getLivestreamConfig(organization.id);
  const hasStream = Boolean(config && (config.liveInputId || config.mode === "MANUAL"));

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 flex items-center gap-2 text-display text-[28px] leading-tight text-ink">
          <Radio size={22} /> Livestream
        </h1>
        <p className="text-sm text-ink-secondary">
          Bring the stream you already run — or let us create an endpoint for you — with playback in your app and
          website and live chat moderated from Community.
        </p>
      </div>
      <LivestreamSetup
        mode={config ? (config.mode === "MANUAL" ? "MANUAL" : "CLOUDFLARE") : null}
        connected={Boolean(config)}
        cfAccountId={config?.cfAccountId ?? ""}
        liveInput={
          hasStream && config
            ? {
                rtmpsUrl: config.rtmpsUrl,
                rtmpsStreamKey: config.rtmpsStreamKey,
                srtUrl: config.srtUrl,
                srtStreamId: config.srtStreamId,
                srtPassphrase: config.srtPassphrase,
                playbackEmbedUrl: config.playbackEmbedUrl,
              }
            : null
        }
        playbackFrameUrl={hasStream ? videoEmbedUrl(config?.playbackEmbedUrl) : null}
      />
    </div>
  );
}
