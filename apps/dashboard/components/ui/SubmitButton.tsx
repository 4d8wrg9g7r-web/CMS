"use client";

import { useContext, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { buttonClasses } from "./Button";
import { FormStateContext } from "./ActionForm";

/**
 * Submit button with a pending state: spinner + disabled while the form's
 * action is in flight. Works inside <ActionForm> (reads its transition) and
 * plain <form action={...}> (falls back to useFormStatus).
 */
export function SubmitButton({
  variant = "primary",
  size = "md",
  className = "",
  pendingLabel,
  children,
  disabled,
  ...props
}: {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  pendingLabel?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const formState = useContext(FormStateContext);
  const { pending: statusPending } = useFormStatus();
  const pending = formState?.pending ?? statusPending;

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={`${buttonClasses(variant, size)} ${className}`}
      {...props}
    >
      {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
