"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { buttonClasses } from "./Button";

/**
 * File input styled as a button that shows the chosen file's name, so the
 * two-step "Choose file → Upload" flow is legible (UX: an sr-only input gave
 * no evidence a file was picked, and Upload with nothing chosen crashed).
 * Listens for the form's reset event because ActionForm's resetOnSuccess
 * clears the input value without React knowing.
 */
export function FilePicker({
  name = "file",
  label = "Choose file",
  accept,
  "data-action": dataAction,
}: {
  name?: string;
  label?: string;
  accept?: string;
  "data-action"?: string;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => setFileName(null);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const display = fileName && fileName.length > 28 ? `${fileName.slice(0, 25)}…` : fileName;

  return (
    <label className={buttonClasses("secondary", "sm") + " max-w-56 cursor-pointer"} data-file-picker>
      <Upload size={14} />
      <span className="truncate">{display ?? label}</span>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        className="sr-only"
        data-action={dataAction}
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
      />
    </label>
  );
}
