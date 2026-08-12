"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";

/**
 * Inspector (docs/design-system.md "Inspector"): the slide-over side panel
 * for contextual micro-edits — inspect or act on a row without leaving the
 * page. Quiet entrance from the right (200ms), backdrop + Escape to close,
 * and MotionConfig honors prefers-reduced-motion. Full-page navigation
 * stays the answer for real editing; this is for glance-and-act.
 */
export function Inspector({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={title}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-black/25"
              onClick={onClose}
            />
            <motion.aside
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 16, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className="absolute inset-y-0 right-0 flex w-full max-w-[400px] flex-col border-l border-border bg-surface shadow-[-8px_0_32px_rgba(0,0,0,0.08)]"
              data-testid="inspector"
            >
              <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-5">
                <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-md p-1.5 text-ink-muted transition-colors duration-180 hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
