import type { Metadata } from "next";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { userService } from "@cms/database";
import { signIn } from "../../auth";
import { noIndexMetadata } from "../../lib/no-index-metadata";
import { SubmitButton } from "../../components/SubmitButton";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";

export const metadata: Metadata = noIndexMetadata;

async function signupAction(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) redirect("/signup?error=missing");
  if (password.length < 8) redirect("/signup?error=short");

  const existing = await userService.findUserByEmail(email);
  if (existing) redirect("/signup?error=exists");

  const passwordHash = await bcrypt.hash(password, 10);
  await userService.createUser({ email, name: name || undefined, passwordHash });

  // Fresh account has no organization yet; "/" lands them on /onboarding to create one.
  // The account row above already committed, so if the auto sign-in fails for any
  // environmental reason (e.g. a misconfigured NEXTAUTH_URL), send the user to the
  // login page with a notice rather than a dead generic error screen. signIn signals
  // SUCCESS by throwing Next's redirect control-flow error — rethrow that one.
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (err) {
    const digest = err && typeof err === "object" && "digest" in err ? String((err as { digest: unknown }).digest) : "";
    if (digest.startsWith("NEXT_REDIRECT")) throw err;
    redirect("/login?created=1");
  }
}

const ERRORS: Record<string, string> = {
  missing: "Email and password are required.",
  short: "Password must be at least 8 characters.",
  exists: "An account with that email already exists — sign in instead.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Create your account</h1>
      {params.error && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          {ERRORS[params.error] ?? "Something went wrong. Try again."}
        </p>
      )}
      <Card>
        <form action={signupAction} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-ink-secondary">
            Name
            <Input name="name" type="text" className="mt-1 block w-full" />
          </label>
          <label className="text-sm font-medium text-ink-secondary">
            Email
            <Input name="email" type="email" required className="mt-1 block w-full" />
          </label>
          <label className="text-sm font-medium text-ink-secondary">
            Password
            <Input name="password" type="password" required minLength={8} className="mt-1 block w-full" />
          </label>
          <SubmitButton pendingLabel="Creating account...">Create account</SubmitButton>
        </form>
      </Card>
      <p className="mt-4 text-sm text-ink-secondary">
        Already have an account?{" "}
        <a href="/login" className="text-accent hover:underline">
          Sign in
        </a>
      </p>
    </main>
  );
}
