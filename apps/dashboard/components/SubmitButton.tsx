"use client";

import { useFormStatus } from "react-dom";
import { buttonClasses } from "./ui/Button";

/**
 * Gives the prayer-wall's signup/login/submit forms real pending feedback -- they
 * were plain server-rendered forms with no client-side pending state at all, so a
 * slow network left the button clickable with no indication a submit was in flight.
 * useFormStatus() reads the status of the nearest ancestor <form>, so this needs no
 * isPending prop-drilling and the pages themselves stay server components -- a
 * smaller diff than replicating BulkImportForm's manual useTransition wrapper three
 * times for near-identical simple forms.
 */
export function SubmitButton({
  children,
  pendingLabel,
  style,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={style} className={buttonClasses("primary", "md")}>
      {pending ? pendingLabel : children}
    </button>
  );
}
