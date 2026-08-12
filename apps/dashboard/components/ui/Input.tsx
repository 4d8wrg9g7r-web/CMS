import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

/**
 * The one bordered-input recipe used everywhere, previously copy-pasted inline
 * across BulkImportForm/ImportResourceForm/every page's own form fields. Fixes the
 * app-wide focus state in one place: focus-visible:ring replaces the old
 * color-only `focus:border-accent` (WCAG 2.4.11). Deliberately a raw element
 * wrapper -- no label/error-message slot, since every call site already hand-rolls
 * its own <label> differently and a compound Field API would be a bigger rewrite
 * than this pass calls for.
 *
 * forwardRef so form libraries' register() (and any future
 * form) can attach a real DOM ref -- every existing call site ignores the ref, so
 * this is purely additive.
 */
const FIELD_CLASSES =
  "block w-full rounded border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors duration-180 placeholder:text-ink-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...props },
  ref,
) {
  return <input ref={ref} className={`${FIELD_CLASSES} ${className}`} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className = "", ...props },
  ref,
) {
  return <textarea ref={ref} className={`${FIELD_CLASSES} ${className}`} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = "", ...props },
  ref,
) {
  return <select ref={ref} className={`${FIELD_CLASSES} ${className}`} {...props} />;
});
