import { Images, Trash2, Upload } from "lucide-react";
import { Card } from "./ui/Card";
import { buttonClasses } from "./ui/Button";
import { deleteMediaAssetAction, uploadMediaAssetAction } from "../app/(dashboard)/media/actions";
import { ActionForm } from "./ui/ActionForm";
import { ConfirmSubmitButton } from "./ui/ConfirmDialog";
import { SubmitButton } from "./ui/SubmitButton";

/**
 * A module's own graphics shelf (docs/domain/app.md): sermon graphics live on
 * the Sermons page, event graphics on the Events page — fully separate
 * collections. Upload/delete here; attach to an item with its GraphicPicker.
 */
export function GraphicsLibraryCard({
  collection,
  title,
  blurb,
  assets,
  canManage,
}: {
  collection: "event" | "sermon";
  title: string;
  blurb: string;
  assets: { id: string; name: string; url: string }[];
  canManage: boolean;
}) {
  return (
    <Card padding="md" data-section={`${collection}-graphics`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Images size={15} /> {title}
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">{blurb}</p>
        </div>
        {canManage && (
          <ActionForm action={uploadMediaAssetAction} resetOnSuccess className="flex items-center gap-2">
            <input type="hidden" name="collection" value={collection} />
            <label className={buttonClasses("secondary", "sm") + " cursor-pointer"}>
              <Upload size={14} /> Choose image
              <input
                type="file"
                name="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                data-action={`upload-${collection}-graphic`}
              />
            </label>
            <SubmitButton size="sm" pendingLabel="Uploading…" data-action={`save-${collection}-graphic`}>
              Upload
            </SubmitButton>
          </ActionForm>
        )}
      </div>

      {assets.length === 0 ? (
        <p className="text-sm text-ink-muted">No graphics yet — upload a PNG, JPEG, WebP, or GIF up to 10 MB.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {assets.map((asset) => (
            <div key={asset.id} className="overflow-hidden rounded-lg border border-border" data-media-asset={asset.id}>
              <a href={asset.url} target="_blank" rel="noreferrer" className="block bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnails */}
                <img src={asset.url} alt={asset.name} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              </a>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <p className="truncate text-xs font-medium text-ink" title={asset.name}>
                  {asset.name}
                </p>
                {canManage && (
                  <ActionForm action={deleteMediaAssetAction.bind(null, asset.id)}>
                    <ConfirmSubmitButton
                      title={`Delete "${asset.name}"?`}
                      message="Events or sermons using this graphic will lose their artwork. This can't be undone."
                      confirmLabel="Delete graphic"
                      aria-label={`Delete ${asset.name}`}
                      className="p-0.5 text-ink-muted hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </ConfirmSubmitButton>
                  </ActionForm>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
