"use client";

import { useActionState } from "react";
import { KeyRound, Loader2, Mail } from "lucide-react";
import {
  requestAppCodeAction,
  verifyAppCodeAction,
  type SignInFormState,
} from "../../app/a/[publicAppId]/actions";

/**
 * Two-step member sign-in: email → 6-digit emailed code → session. The reply to
 * the email step is identical whether or not the address matched a person — no
 * account enumeration from the public surface.
 */
export function AppSignIn({ publicAppId, accent }: { publicAppId: string; accent: string }) {
  const [state, formAction, pending] = useActionState<SignInFormState, FormData>(
    async (prev, fd) =>
      prev.step === "email"
        ? requestAppCodeAction(publicAppId, prev, fd)
        : verifyAppCodeAction(publicAppId, prev, fd),
    { step: "email", email: "", error: null },
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.step === "email" ? (
        <>
          <label className="text-sm font-medium text-neutral-700">
            Your email address
            <div className="relative mt-1">
              <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="email"
                name="email"
                required
                autoFocus
                placeholder="you@example.com"
                className="w-full rounded-xl border border-neutral-300 bg-white py-3 pl-10 pr-4 text-sm text-neutral-900 outline-none focus:border-neutral-500"
              />
            </div>
          </label>
          <p className="text-xs text-neutral-500">
            Use the email your church has on file — we&rsquo;ll send you a 6-digit sign-in code.
          </p>
        </>
      ) : (
        <>
          <input type="hidden" name="email" value={state.email} />
          <p className="text-sm text-neutral-700">
            If <span className="font-semibold">{state.email}</span> is in our directory, a 6-digit code is on its way.
          </p>
          <label className="text-sm font-medium text-neutral-700">
            Enter the code
            <div className="relative mt-1">
              <KeyRound size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                name="code"
                required
                autoFocus
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                className="w-full rounded-xl border border-neutral-300 bg-white py-3 pl-10 pr-4 text-center text-lg font-bold tracking-[0.4em] text-neutral-900 outline-none focus:border-neutral-500"
              />
            </div>
          </label>
        </>
      )}

      {state.error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: accent }}
      >
        {pending && <Loader2 size={15} className="animate-spin" />}
        {state.step === "email" ? "Send me a code" : "Sign in"}
      </button>
    </form>
  );
}
