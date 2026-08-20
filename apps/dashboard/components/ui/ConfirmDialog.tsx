"use client";

import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClasses } from "./Button";
import { FormStateContext } from "./ActionForm";
import { SubmitButton } from "./SubmitButton";

/**
 * Confirmation for destructive actions (UX audit #4): the trigger opens a
 * dialog that names the consequence; nothing is submitted until the person
 * confirms. Two flavors — ConfirmSubmitButton submits the enclosing form
 * (rendered inline, not portaled, so the confirm button is a real submit),
 * ConfirmActionButton runs a callback for client-side flows.
 */

function DialogShell({
  title,
  message,
  onCancel,
  children,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      data-confirm-dialog
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mt-1.5 text-sm text-ink-secondary">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={buttonClasses("secondary", "sm")} data-confirm-cancel>
            Cancel
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Trigger + dialog whose confirm is a real submit for the enclosing form. */
export function ConfirmSubmitButton({
  title,
  message,
  confirmLabel = "Delete",
  className = "",
  children,
  ...props
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
} & Record<`data-${string}`, string>) {
  const [open, setOpen] = useState(false);
  const formState = useContext(FormStateContext);
  const wasPending = useRef(false);

  // Close once the submit finishes (covers archive-style actions where the
  // row survives; deletions unmount the whole form anyway).
  useEffect(() => {
    if (wasPending.current && !formState?.pending) setOpen(false);
    wasPending.current = Boolean(formState?.pending);
  }, [formState?.pending]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} {...props}>
        {children}
      </button>
      {open && (
        <DialogShell title={title} message={message} onCancel={() => setOpen(false)}>
          <SubmitButton variant="danger" size="sm" pendingLabel="Working…" data-confirm-submit>
            {confirmLabel}
          </SubmitButton>
        </DialogShell>
      )}
    </>
  );
}

/** Trigger + dialog for client-side flows (no form) — confirm runs onConfirm. */
export function ConfirmActionButton({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  className = "",
  children,
  ...props
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
} & Record<`data-${string}`, string>) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} {...props}>
        {children}
      </button>
      {open && (
        <DialogShell title={title} message={message} onCancel={() => (busy ? null : setOpen(false))}>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
            className={buttonClasses("danger", "sm")}
            data-confirm-submit
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </DialogShell>
      )}
    </>
  );
}
