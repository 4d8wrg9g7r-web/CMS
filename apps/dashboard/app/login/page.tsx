import type { Metadata } from "next";
import { AuthError } from "next-auth";
import { noIndexMetadata } from "../../lib/no-index-metadata";

export const metadata: Metadata = noIndexMetadata;
import { redirect } from "next/navigation";
import { signIn } from "../../auth";
import { SubmitButton } from "../../components/SubmitButton";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect("/login?error=invalid");
    }
    throw err;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Sign in</h1>
      {params.error && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">Invalid email or password.</p>
      )}
      {params.reset && (
        <p className="mb-4 rounded-md bg-success-bg px-3 py-2 text-sm text-success">
          Password reset. Sign in with your new password.
        </p>
      )}
      <Card>
        <form action={loginAction} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-ink-secondary">
            Email
            <Input name="email" type="email" required className="mt-1 block w-full" />
          </label>
          <label className="text-sm font-medium text-ink-secondary">
            Password
            <Input name="password" type="password" required className="mt-1 block w-full" />
          </label>
          <SubmitButton pendingLabel="Signing in...">Sign in</SubmitButton>
        </form>
      </Card>
      <p className="mt-4 flex items-center justify-between text-sm text-ink-secondary">
        <a href="/forgot-password" className="text-accent hover:underline">
          Forgot password?
        </a>
        <a href="/signup" className="text-accent hover:underline">
          Create an account
        </a>
      </p>
    </main>
  );
}
