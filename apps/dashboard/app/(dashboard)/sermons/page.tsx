import Link from "next/link";
import { Archive, Clapperboard, ExternalLink, Lock } from "lucide-react";
import { mediaService, sermonService } from "@cms/database";
import { GraphicsLibraryCard } from "../../../components/GraphicsLibraryCard";
import { SermonForm } from "../../../components/SermonForm";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { canApp } from "../../../lib/app-access";
import { getCurrentOrganization } from "../../../lib/session";
import { archiveSermonAction } from "./actions";

export default async function SermonsPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [canView, canManage] = await Promise.all([
    canApp(organization.id, "sermon.view"),
    canApp(organization.id, "sermon.manage"),
  ]);
  if (!canView) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to Sermons" description="" />
      </Card>
    );
  }

  const sermons = await sermonService.listSermons(organization.id);
  const graphics = await mediaService.listMediaAssets(organization.id, { collection: "sermon" });
  // Distinct speakers/series feed the form's dropdowns (newest-first order kept).
  const speakers = [...new Set(sermons.map((s) => s.speaker).filter((v): v is string => !!v))];
  const seriesList = [...new Set(sermons.map((s) => s.series).filter((v): v is string => !!v))];

  return (
    <div>
      <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Sermons</h1>
      <p className="mb-6 text-sm text-ink-secondary">
        Your sermon library — it powers the Sermons tab in your church app. Link videos from YouTube, Vimeo, or
        your podcast host; nothing is re-uploaded.
      </p>

      {canManage && (
        <Card padding="md" className="mb-6">
          <SermonForm speakers={speakers} seriesList={seriesList} />
        </Card>
      )}

      {sermons.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Clapperboard size={22} />}
            title="No sermons yet"
            description="Add your first sermon above and it will appear in the app immediately."
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Speaker</th>
                  <th className="px-5 py-3 font-medium">Series</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Video</th>
                  {canManage && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody>
                {sermons.map((sermon) => (
                  <tr key={sermon.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 font-medium text-ink">
                      <Link href={`/sermons/${sermon.id}`} className="hover:text-accent">{sermon.title}</Link>
                      {sermon.passage && <span className="ml-2 text-xs text-ink-muted">{sermon.passage}</span>}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{sermon.speaker ?? "—"}</td>
                    <td className="px-5 py-3 text-ink-secondary">{sermon.series ?? "—"}</td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {sermon.preachedAt.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className="px-5 py-3">
                      {sermon.videoUrl ? (
                        <a
                          href={sermon.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-accent hover:text-accent-dark"
                        >
                          Watch <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-5 py-3 text-right">
                        <form action={archiveSermonAction.bind(null, sermon.id)}>
                          <button
                            type="submit"
                            aria-label={`Archive ${sermon.title}`}
                            className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-danger"
                          >
                            <Archive size={13} /> Archive
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-6">
        <GraphicsLibraryCard
          collection="sermon"
          title="Sermon graphics"
          blurb="Series and message artwork — attach to a sermon from its page. Separate from event graphics."
          assets={graphics.map((g) => ({ id: g.id, name: g.name, url: g.url }))}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
