import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Headphones, Lock, Trash2, Upload } from "lucide-react";
import { parseSermonLinks, sermonService } from "@cms/database";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { SermonDetailEditor } from "../../../../components/SermonDetailEditor";
import { buttonClasses } from "../../../../components/ui/Button";
import { canApp } from "../../../../lib/app-access";
import { getCurrentOrganization } from "../../../../lib/session";
import {
  removeSermonAudioAction,
  removeSermonDocumentAction,
  uploadSermonAudioAction,
  uploadSermonDocumentAction,
} from "../actions";

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Sermon detail (docs/domain/app.md): edit metadata/links, documents, audio. */
export default async function SermonDetailPage({ params }: { params: Promise<{ sermonId: string }> }) {
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

  const { sermonId } = await params;
  const sermon = await sermonService.getSermon(organization.id, sermonId);
  if (!sermon) notFound();

  const all = await sermonService.listSermons(organization.id, { includeArchived: true });
  const speakers = [...new Set(all.map((s) => s.speaker).filter((v): v is string => !!v))];
  const seriesList = [...new Set(all.map((s) => s.series).filter((v): v is string => !!v))];

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/sermons" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Sermons
      </Link>
      <h1 className="mb-6 text-display text-[28px] leading-tight text-ink">{sermon.title}</h1>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card padding="md" className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-ink">Details</h2>
          {canManage ? (
            <SermonDetailEditor
              sermon={{
                id: sermon.id,
                title: sermon.title,
                speaker: sermon.speaker,
                series: sermon.series,
                passage: sermon.passage,
                description: sermon.description,
                videoUrl: sermon.videoUrl,
                preachedAt: sermon.preachedAt.toISOString().slice(0, 10),
                links: parseSermonLinks(sermon.links),
              }}
              speakers={speakers}
              seriesList={seriesList}
            />
          ) : (
            <p className="text-sm text-ink-secondary">
              {[sermon.speaker, sermon.series, sermon.passage].filter(Boolean).join(" · ") || "No details"}
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card padding="md" data-section="sermon-audio">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Headphones size={15} /> Audio
            </h2>
            {sermon.audioUrl ? (
              <>
                <audio controls preload="none" src={sermon.audioUrl} className="w-full" />
                {canManage && (
                  <form action={removeSermonAudioAction.bind(null, sermon.id)} className="mt-2">
                    <button type="submit" className="text-xs text-ink-muted hover:text-danger">
                      Remove audio
                    </button>
                  </form>
                )}
              </>
            ) : (
              <>
                <p className="mb-3 text-xs text-ink-muted">
                  For listeners who don&rsquo;t want video — plays in the app and on your website.
                </p>
                {canManage && (
                  <form action={uploadSermonAudioAction.bind(null, sermon.id)}>
                    <label className={buttonClasses("secondary", "sm") + " cursor-pointer"}>
                      <Upload size={14} /> Upload audio
                      <input type="file" name="file" accept="audio/*" className="sr-only" data-action="upload-audio" />
                    </label>
                    <button type="submit" className={buttonClasses("primary", "sm") + " ml-2"} data-action="save-audio">
                      Save
                    </button>
                  </form>
                )}
              </>
            )}
          </Card>

          <Card padding="md" data-section="sermon-documents">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <FileText size={15} /> Documents
            </h2>
            {sermon.documents.length === 0 ? (
              <p className="mb-3 text-xs text-ink-muted">Notes, discussion guides, slides — downloadable with the message.</p>
            ) : (
              <ul className="mb-3 space-y-1.5 text-sm">
                {sermon.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-2" data-document={doc.id}>
                    <a href={doc.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-accent hover:underline">
                      {doc.name}
                    </a>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-ink-muted">
                      {formatBytes(doc.sizeBytes)}
                      {canManage && (
                        <form action={removeSermonDocumentAction.bind(null, sermon.id, doc.id)}>
                          <button type="submit" aria-label={`Remove ${doc.name}`} className="p-0.5 hover:text-danger">
                            <Trash2 size={13} />
                          </button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <form action={uploadSermonDocumentAction.bind(null, sermon.id)}>
                <label className={buttonClasses("secondary", "sm") + " cursor-pointer"}>
                  <Upload size={14} /> Choose document
                  <input
                    type="file"
                    name="file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt"
                    className="sr-only"
                    data-action="upload-document"
                  />
                </label>
                <button type="submit" className={buttonClasses("primary", "sm") + " ml-2"} data-action="save-document">
                  Add
                </button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
