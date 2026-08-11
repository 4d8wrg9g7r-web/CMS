"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { uploadAppAvatarAction } from "../../app/a/[publicAppId]/actions";

/** Self-service profile photo (session-gated upload; sets Person.photoUrl). */
export function AvatarUploader({ publicAppId, accent }: { publicAppId: string; accent: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <label
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
        style={{ backgroundColor: accent }}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />} Change photo
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setError(null);
            const fd = new FormData();
            fd.set("file", file);
            const result = await uploadAppAvatarAction(publicAppId, fd);
            setBusy(false);
            if ("error" in result) setError(result.error);
            else router.refresh();
          }}
        />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
