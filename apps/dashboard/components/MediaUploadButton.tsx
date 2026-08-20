"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import type { MediaCollection } from "@cms/database";
import { buttonClasses } from "./ui/Button";
import { useToast } from "./ui/Toast";
import { uploadMediaFile, type UploadMode } from "../lib/client-media-upload";
import { registerMediaAssetAction } from "../app/(dashboard)/media/actions";

/**
 * One-tap media upload: pick a file and it uploads immediately — browser →
 * Blob storage via the client-upload token flow (no serverless request-size
 * ceiling; Vercel caps action bodies at ~4.5 MB), then registers the asset.
 * Progress on the button, result as a toast.
 */
export function MediaUploadButton({
  collection,
  uploadMode,
  label = "Upload file",
  accept,
  "data-action": dataAction,
}: {
  collection: MediaCollection;
  uploadMode: UploadMode;
  label?: string;
  accept?: string;
  "data-action"?: string;
}) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const start = async (file: File) => {
    setProgress(0);
    try {
      const url = await uploadMediaFile(collection, file, uploadMode, setProgress);
      const result = await registerMediaAssetAction(collection, {
        url,
        name: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (result.ok) showToast(result.message ?? "Uploaded", "success");
      else showToast(result.formError ?? "Upload failed", "error");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={progress !== null}
        className={buttonClasses("secondary", "sm")}
        data-action={dataAction}
        data-upload-button
      >
        {progress !== null ? (
          <>
            <Loader2 size={14} className="animate-spin" /> Uploading… {progress}%
          </>
        ) : (
          <>
            <Upload size={14} /> {label}
          </>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="sr-only"
        data-upload-input
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void start(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
