import { Lock, Radio } from "lucide-react";
import { livestreamService } from "@cms/database";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LivestreamSetup } from "../../../components/LivestreamSetup";
import { canApp } from "../../../lib/app-access";
import { getCurrentOrganization } from "../../../lib/session";

/** Livestream ingest (docs/domain/app.md): Cloudflare Stream RTMPS/SRT setup. */
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 flex items-center gap-2 text-display text-[28px] leading-tight text-ink">
          <Radio size={22} /> Livestream
        </h1>
        <p className="text-sm text-ink-secondary">
          Stream services straight from your encoder over RTMPS or SRT, with playback in your app and on your
          website — and live chat moderated from Community.
        </p>
      </div>
      <LivestreamSetup
        connected={Boolean(config)}
        cfAccountId={config?.cfAccountId ?? ""}
        liveInput={
          config?.liveInputId
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
      />
    </div>
  );
}
