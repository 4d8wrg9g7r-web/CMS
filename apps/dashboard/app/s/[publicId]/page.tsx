import { notFound } from "next/navigation";
import { CalendarDays, FileText } from "lucide-react";
import { parseSermonLinks, sermonService, videoEmbedUrl } from "@cms/database";

/**
 * Public sermon page (docs/domain/app.md): the share/embed target for one
 * message — video embed (privacy-enhanced player), audio-only player, custom
 * links, and documents. Resolved by unguessable publicId; active sermons
 * only; no person data. Also the iframe target for the share box's embed code.
 */
export default async function PublicSermonPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const sermon = await sermonService.getSermonByPublicId(publicId);
  if (!sermon) notFound();

  const embed = videoEmbedUrl(sermon.videoUrl);
  const links = parseSermonLinks(sermon.links);

  return (
    <div className="min-h-screen bg-surface-muted">
      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="mb-6 text-sm font-semibold text-ink-secondary">{sermon.organization.name}</p>

        {sermon.videoFileUrl ? (
          <video
            controls
            preload="metadata"
            src={sermon.videoFileUrl}
            className="mb-6 aspect-video w-full rounded-2xl border border-border bg-black"
            data-public-video-file
          />
        ) : null}
        {!embed && !sermon.videoFileUrl && sermon.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- church-managed graphic
          <img
            src={sermon.artworkUrl}
            alt=""
            className="mb-6 aspect-video w-full rounded-2xl border border-border object-cover"
            data-public-artwork
          />
        ) : null}
        {embed && !sermon.videoFileUrl ? (
          <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-black">
            <div className="aspect-video w-full">
              <iframe
                src={embed}
                title={sermon.title}
                className="h-full w-full"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </div>
        ) : null}

        {sermon.series && <p className="text-xs font-semibold uppercase tracking-wide text-accent">{sermon.series}</p>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{sermon.title}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-secondary">
          <CalendarDays size={14} className="text-ink-muted" />
          {[
            sermon.speaker,
            sermon.preachedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
            sermon.passage,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {sermon.description && <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">{sermon.description}</p>}

        {sermon.audioUrl && (
          <div className="mt-6" data-public-audio>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">Listen</p>
            <audio controls preload="none" src={sermon.audioUrl} className="w-full" />
          </div>
        )}

        {links.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2" data-public-links>
            {links.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink hover:bg-surface-muted"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}

        {sermon.documents.length > 0 && (
          <div className="mt-6" data-public-documents>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">Resources</p>
            <ul className="space-y-1.5 text-sm">
              {sermon.documents.map((doc) => (
                <li key={doc.id}>
                  <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-accent hover:underline">
                    <FileText size={14} /> {doc.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
