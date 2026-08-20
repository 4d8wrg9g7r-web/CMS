import { FileText, FolderOpen, Lock, Music, Search, Trash2 } from "lucide-react";
import { mediaService } from "@cms/database";
import { Card } from "../../../components/ui/Card";
import { CopyUrlButton } from "../../../components/CopyUrlButton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input } from "../../../components/ui/Input";
import { buttonClasses } from "../../../components/ui/Button";
import { canApp } from "../../../lib/app-access";
import { getCurrentOrganization } from "../../../lib/session";
import { deleteMediaAssetAction } from "../media/actions";
import { ActionForm } from "../../../components/ui/ActionForm";
import { ConfirmSubmitButton } from "../../../components/ui/ConfirmDialog";
import { MediaUploadButton } from "../../../components/MediaUploadButton";
import { getUploadMode } from "../../../lib/upload-mode";

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function fileIcon(contentType: string) {
  if (contentType.startsWith("audio/")) return <Music size={16} className="text-ink-muted" />;
  return <FileText size={16} className="text-ink-muted" />;
}

/**
 * Files (docs/domain/app.md): general uploads — images, documents, audio —
 * with a hosted link for each, for use anywhere (emails, link tabs, website
 * sections). Event and sermon graphics live on their own module pages.
 */
export default async function FilesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [canView, canManage] = await Promise.all([
    canApp(organization.id, "app.view"),
    canApp(organization.id, "app.manage"),
  ]);
  if (!canView) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to Files" description="" />
      </Card>
    );
  }

  const { q = "" } = await searchParams;
  const assets = await mediaService.listMediaAssets(organization.id, {
    collection: "library",
    q: q.trim() || undefined,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 flex items-center gap-2 text-display text-[28px] leading-tight text-ink">
          <FolderOpen size={22} /> Files
        </h1>
        <p className="text-sm text-ink-secondary">
          General uploads with a hosted link — images, PDFs, documents, audio. Use the links anywhere: emails, app
          link tabs, website sections.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form action="/files" method="get" className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input name="q" defaultValue={q} placeholder="Search files…" className="pl-8" aria-label="Search files" />
          </div>
          <button type="submit" className={buttonClasses("secondary", "sm")}>
            Search
          </button>
        </form>
        {canManage && (
          <div data-section="files-upload">
            <MediaUploadButton collection="library" uploadMode={getUploadMode()} label="Upload file" data-action="upload-file" />
          </div>
        )}
      </div>

      {assets.length === 0 ? (
        <Card padding="md">
          <EmptyState
            icon={<FolderOpen size={22} />}
            title={q ? "No files match your search" : "No files yet"}
            description={canManage ? "Upload images, PDFs, documents, or audio up to 25 MB." : ""}
          />
        </Card>
      ) : (
        <Card padding="none" data-section="files-list">
          <ul className="divide-y divide-border/60">
            {assets.map((asset) => (
              <li key={asset.id} className="flex items-center gap-3 px-5 py-3" data-media-asset={asset.id}>
                {asset.contentType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- thumbnails
                  <img src={asset.url} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted">
                    {fileIcon(asset.contentType)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <a href={asset.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-ink hover:underline">
                    {asset.name}
                  </a>
                  <p className="text-xs text-ink-muted">
                    {formatBytes(asset.sizeBytes)} · {asset.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <CopyUrlButton url={asset.url} />
                {canManage && (
                  <ActionForm action={deleteMediaAssetAction.bind(null, asset.id)}>
                    <ConfirmSubmitButton
                      title={`Delete "${asset.name}"?`}
                      message="Anywhere this file is linked — newsletters, pages, posts — will stop loading it. This can't be undone."
                      confirmLabel="Delete file"
                      aria-label={`Delete ${asset.name}`}
                      className="p-1 text-ink-muted hover:text-danger"
                      data-action="delete-file"
                    >
                      <Trash2 size={14} />
                    </ConfirmSubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
