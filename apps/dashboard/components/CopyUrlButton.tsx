"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

/** Small copy-the-hosted-link button for the Files library. */
export function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* the Open link remains */
        }
      }}
      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
      data-action="copy-file-url"
    >
      {copied ? <Check size={12} className="text-success" /> : <Link2 size={12} />} {copied ? "Copied" : "Copy link"}
    </button>
  );
}
