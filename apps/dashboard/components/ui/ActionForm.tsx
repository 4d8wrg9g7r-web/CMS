"use client";

import { createContext, useContext, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import type { ActionResult } from "../../lib/action-result";

/**
 * Client form wrapper for ActionResult-returning server actions. Submits via
 * onSubmit + transition (not <form action>) so the browser never auto-resets
 * the fields — on a validation error everything the user typed stays put,
 * with errors rendered inline by <FieldError>. Success and failure both
 * surface through the toast stack; SubmitButton reads the pending state.
 * Children stay server-rendered when this is used from a server component.
 */

interface FormStateValue {
  pending: boolean;
  fieldErrors: Record<string, string>;
  formError: string | null;
}

export const FormStateContext = createContext<FormStateValue | null>(null);

export function ActionForm({
  action,
  successToast,
  resetOnSuccess = false,
  className,
  children,
  ...rest
}: {
  action: (formData: FormData) => Promise<ActionResult | void>;
  /** Fallback success toast when the action doesn't return its own message. */
  successToast?: string;
  /** Clear the fields after a successful submit (for "add another" forms). */
  resetOnSuccess?: boolean;
  className?: string;
  children: ReactNode;
} & Record<`data-${string}`, string>) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      let result: ActionResult | void;
      try {
        result = await action(formData);
      } catch (err) {
        // Framework control flow (redirect/notFound) must keep propagating.
        // Match the specific digests: in production Next attaches a digest to
        // EVERY masked server-action error, so "has a digest" would send
        // ordinary failures to the error boundary instead of the toast.
        const digest = err && typeof err === "object" && "digest" in err ? (err as { digest?: unknown }).digest : undefined;
        if (
          typeof digest === "string" &&
          (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND" || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
        ) {
          throw err;
        }
        setFormError("Something went wrong — please try again.");
        showToast("Something went wrong — please try again.", "error");
        return;
      }
      if (result && !result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.formError ?? null);
        if (result.formError) showToast(result.formError, "error");
        return;
      }
      setFieldErrors({});
      setFormError(null);
      const message = (result?.ok ? result.message : undefined) ?? successToast;
      if (message) showToast(message);
      if (resetOnSuccess) form.reset();
      if (result?.ok && result.redirectTo) router.push(result.redirectTo);
    });
  };

  return (
    <FormStateContext.Provider value={{ pending, fieldErrors, formError }}>
      <form onSubmit={onSubmit} className={className} {...rest}>
        {children}
      </form>
    </FormStateContext.Provider>
  );
}

/** Inline error for one field; renders nothing while the field is valid. */
export function FieldError({ name }: { name: string }) {
  const state = useContext(FormStateContext);
  const message = state?.fieldErrors[name];
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-danger" role="alert" data-field-error={name}>
      {message}
    </p>
  );
}

/** Form-level error line (also toasted); for errors not tied to a field. */
export function FormError() {
  const state = useContext(FormStateContext);
  if (!state?.formError) return null;
  return (
    <p className="mt-2 text-sm text-danger" role="alert" data-form-error>
      {state.formError}
    </p>
  );
}
