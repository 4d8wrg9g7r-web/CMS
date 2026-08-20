"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Clapperboard, Upload } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { useToast } from "./ui/Toast";
import { attachSermonVideoAction, removeSermonVideoAction } from "../app/(dashboard)/sermons/actions";

/**
 * Self-hosted sermon video (docs/domain/app.md "Self-hosted media"): uploads
 * go browser → the org's own Blob storage via the client-upload token flow
 * (no serverless size ceiling); local dev falls back to a direct POST. After
 * upload, the media worker extracts an audio-only track automatically.
 */
export function SermonVideoCard({
  sermonId,
  videoFileUrl,
  audioPending,
  uploadMode,
}: {
  sermonId: string;
  videoFileUrl: string | null;
  /** An EXTRACT_AUDIO job is pending/running for this sermon. */
  audioPending: boolean;
  /** Decided server-side (lib/upload-mode.ts): "blob" in production, "direct" in local dev. */
  uploadMode: "blob" | "direct";
}) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const start = async (file: File) => {
    setProgress(0);
    try {
      const route = "/api/uploads/sermon-video";
      let finalUrl: string;
      if (uploadMode === "blob") {
        try {
          const blob = await upload(`sermons/${sermonId}/${file.name}`, file, {
            access: "public",
            handleUploadUrl: route,
            contentType: file.type,
            onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
          });
          finalUrl = blob.url;
        } catch (err) {
          if (err instanceof SyntaxError) {
            throw new Error("The storage service returned an unreadable response — please try again.");
          }
          throw err;
        }
      } else {
        // Local dev (no Blob store): send the file body straight to the route.
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch(`${route}?dev=1`, { method: "POST", body: fd });
        const text = await res.text();
        let data: { url?: string; error?: string } = {};
        try {
          data = JSON.parse(text) as { url?: string; error?: string };
        } catch {
          throw new Error(`Upload failed (HTTP ${res.status}) — please try again.`);
        }
        if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
        finalUrl = data.url;
      }
      await attachSermonVideoAction(sermonId, finalUrl);
      showToast("Video uploaded — audio will be extracted automatically", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setProgress(null);
    }
  };

  return (
    <div data-section="sermon-video">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Clapperboard size={15} /> Video file
      </h2>

      {videoFileUrl ? (
        <>
          <video controls preload="metadata" src={videoFileUrl} className="w-full rounded-lg border border-border bg-black" data-sermon-video-player />
          {audioPending && (
            <p className="mt-1.5 text-xs text-ink-muted" data-audio-pending>
              Audio-only version is being extracted…
            </p>
          )}
          <form action={removeSermonVideoAction.bind(null, sermonId)} className="mt-2">
            <button type="submit" className="text-xs text-ink-muted hover:text-danger" data-action="remove-video">
              Remove video
            </button>
          </form>
        </>
      ) : progress !== null ? (
        <div data-video-progress>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">Uploading… {progress}%</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-ink-muted">
            Upload the service recording (up to 4 GB) — it plays in the app and on your website, and the audio-only
            version is split out automatically.
          </p>
          <button type="button" onClick={() => fileRef.current?.click()} className={buttonClasses("secondary", "sm")} data-action="upload-video">
            <Upload size={14} /> Upload video
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="sr-only"
            data-video-file
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void start(file);
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}
