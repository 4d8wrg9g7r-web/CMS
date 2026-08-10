"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { Input } from "./ui/Input";

type State = { plaintextKey: string | null; error: string | null };

/**
 * Client wrapper so a freshly minted API key renders ONCE, in memory -- never in a URL,
 * never stored (hash-only on the server). Refreshing the page loses it by design.
 */
export function ApiKeyCreator({
  action,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState(action, { plaintextKey: null, error: null });

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-ink-secondary">
          Key name
          <Input name="name" placeholder="Website integration" className="mt-1 w-64" />
        </label>
        <button type="submit" disabled={pending} className={buttonClasses("primary", "sm")}>
          <KeyRound size={14} /> {pending ? "Creating…" : "Create key"}
        </button>
      </form>
      {state.error && <p className="mt-2 text-sm text-danger">{state.error}</p>}
      {state.plaintextKey && (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning-bg p-3">
          <p className="mb-1 text-xs font-semibold text-warning">
            Copy this key now — it will not be shown again.
          </p>
          <code className="block break-all rounded bg-surface px-2 py-1.5 text-xs text-ink">{state.plaintextKey}</code>
        </div>
      )}
    </div>
  );
}
