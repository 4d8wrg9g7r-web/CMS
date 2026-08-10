import type { Metadata } from "next";
import bcrypt from "bcryptjs";
import { noIndexMetadata } from "../../lib/no-index-metadata";

export const metadata: Metadata = noIndexMetadata;
import { redirect } from "next/navigation";
import { userService } from "@cms/database";
import { SubmitButton } from "../../components/SubmitButton";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";

async function resetPasswordAction(token: string, formData: FormData) {
  "use server";
  const record = await userService.getValidPasswordResetToken(token);
  if (!record) redirect("/reset-password?error=invalid_token");

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (password.length < 8) redirect(`/reset-password?token=${token}&error=too_short`);
  if (password !== confirmPassword) redirect(`/reset-password?token=${token}&error=mismatch`);

  const passwordHash = await bcrypt.hash(password, 10);
  await userService.updatePassword(record.userId, passwordHash);
  await userService.deletePasswordResetToken(token);

  redirect("/login?reset=1");
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_token: "This reset link is invalid or has expired. Request a new one below.",
  too_short: "Password must be at least 8 characters.",
  mismatch: "Passwords don't match.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  const record = token ? await userService.getValidPasswordResetToken(token) : null;
  const boundReset = resetPasswordAction.bind(null, token);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold text-ink">Choose a new password</h1>
      <p className="mb-6 text-sm text-ink-secondary">Enter a new password for your account.</p>
      {sp.error && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          {ERROR_MESSAGES[sp.error] ?? "Something went wrong."}
        </p>
      )}
      {!record ? (
        <Card>
          <p className="mb-3 text-sm text-ink-secondary">
            This reset link is invalid or has expired.
          </p>
          <a href="/forgot-password" className="text-sm text-accent hover:underline">
            Request a new link
          </a>
        </Card>
      ) : (
        <Card>
          <form action={boundReset} className="flex flex-col gap-3">
            <label className="text-sm font-medium text-ink-secondary">
              New password
              <Input name="password" type="password" required minLength={8} className="mt-1 block w-full" />
            </label>
            <label className="text-sm font-medium text-ink-secondary">
              Confirm password
              <Input name="confirmPassword" type="password" required minLength={8} className="mt-1 block w-full" />
            </label>
            <SubmitButton pendingLabel="Saving...">Reset password</SubmitButton>
          </form>
        </Card>
      )}
    </main>
  );
}
