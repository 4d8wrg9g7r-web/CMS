"use client";

import { useActionState, useRef, useState } from "react";
import { ImagePlus, Loader2, Megaphone, X } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { Textarea } from "./ui/Input";
import {
  createAnnouncementAction,
  uploadAnnouncementPhotoAction,
  type AnnouncementFormState,
} from "../app/(dashboard)/community/actions";

/** Church announcement composer — posts to the app's home feed as the church. */
export function AnnouncementForm() {
  const [state, formAction, pending] = useActionState<AnnouncementFormState, FormData>(createAnnouncementAction, {
    error: null,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const attachPhoto = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadAnnouncementPhotoAction(fd);
    setUploading(false);
    if ("error" in result) setUploadError(result.error);
    else setPhotoUrl(result.url);
  };

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        formAction(fd);
        formRef.current?.reset();
        setPhotoUrl("");
      }}
      className="flex flex-col gap-3"
    >
      <Textarea
        name="body"
        required={!photoUrl}
        rows={3}
        maxLength={1000}
        placeholder="Share an announcement with everyone in the app — service times, weather closures, celebrations…"
        className="block w-full"
      />
      <input type="hidden" name="imageUrl" value={photoUrl} />
      {photoUrl && (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded photo preview */}
          <img src={photoUrl} alt="Attached" className="max-h-40 rounded-md object-cover" />
          <button
            type="button"
            aria-label="Remove photo"
            onClick={() => setPhotoUrl("")}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
          >
            <X size={13} />
          </button>
        </div>
      )}
      {(state.error || uploadError) && (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error ?? uploadError}</p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending || uploading} className={buttonClasses("primary", "md")}>
          <Megaphone size={15} /> {pending ? "Posting…" : "Post announcement"}
        </button>
        <label className={buttonClasses("secondary", "md")}>
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} Photo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void attachPhoto(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </form>
  );
}
