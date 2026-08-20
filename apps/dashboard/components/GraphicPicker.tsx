"use client";

import { useRef, useState, useTransition } from "react";
import { ImageIcon, Upload, X } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { useToast } from "./ui/Toast";
import {
  setEventImageAction,
  setSermonArtworkAction,
  uploadAndAttachAction,
} from "../app/(dashboard)/media/actions";

/**
 * Graphic picker for one item (docs/domain/app.md "Media library"): shows the
 * current Event.imageUrl / Sermon.artworkUrl, and sets it from the media
 * library or a direct upload (which also lands in the library).
 */
export function GraphicPicker({
  target,
  currentUrl,
  assets,
}: {
  target: { kind: "event" | "sermon"; id: string };
  currentUrl: string | null;
  /** Library assets in this item's collection, newest first. */
  assets: { id: string; name: string; url: string }[];
}) {
  const { showToast } = useToast();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const setAction = target.kind === "event" ? setEventImageAction : setSermonArtworkAction;

  const setUrl = (url: string) => {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("url", url);
        const result = await setAction(target.id, fd);
        if (!result.ok) {
          showToast(result.formError ?? "Could not update the graphic", "error");
          return;
        }
        setLibraryOpen(false);
      } catch {
        // Production masks server errors, so the message is generic either way.
        showToast("Could not update the graphic — please try again.", "error");
      }
    });
  };

  const upload = (file: File) => {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        const result = await uploadAndAttachAction(target, fd);
        if (!result.ok) {
          showToast(result.formError ?? "Upload failed", "error");
          return;
        }
        showToast(result.message ?? "Graphic uploaded to your media library", "success");
      } catch {
        showToast("Upload failed — please try again.", "error");
      }
    });
  };

  return (
    <div data-section="graphic-picker">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <ImageIcon size={15} /> Graphic
      </h2>

      {currentUrl ? (
        <div className="relative mb-2 overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element -- user-managed graphic */}
          <img src={currentUrl} alt="Current graphic" className="aspect-video w-full object-cover" data-current-graphic />
          <button
            type="button"
            onClick={() => setUrl("")}
            disabled={isPending}
            aria-label="Remove graphic"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
            data-action="remove-graphic"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <p className="mb-2 text-xs text-ink-muted">
          Shown with this {target.kind} on the app and your website.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setLibraryOpen((o) => !o)}
          className={buttonClasses("secondary", "sm")}
          aria-expanded={libraryOpen}
          data-action="open-library"
        >
          <ImageIcon size={13} /> Choose from library
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={isPending}
          className={buttonClasses("secondary", "sm")}
          data-action="upload-graphic"
        >
          <Upload size={13} /> {isPending ? "Working…" : "Upload"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          data-graphic-file
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </div>

      {libraryOpen && (
        <div className="mt-3 rounded-lg border border-border bg-surface-muted p-2" data-section="graphic-library">
          {assets.length === 0 ? (
            <p className="p-2 text-xs text-ink-muted">
              No graphics in this collection yet — upload one, or add graphics on the Media page.
            </p>
          ) : (
            <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => setUrl(asset.url)}
                  disabled={isPending}
                  title={asset.name}
                  className="overflow-hidden rounded-md border border-border hover:border-accent"
                  data-library-asset={asset.id}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnails */}
                  <img src={asset.url} alt={asset.name} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
