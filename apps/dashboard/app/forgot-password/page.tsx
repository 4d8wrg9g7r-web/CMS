import type { Metadata } from "next";
import { headers } from "next/headers";
import { noIndexMetadata } from "../../lib/no-index-metadata";

export const metadata: Metadata = noIndexMetadata;
import { redirect } from "next/navigation";
import { userService } from "@cms/database";
import { getEmailProvider } from "@cms/email";
import { SubmitButton } from "../../components/SubmitButton";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { checkRateLimit, getClientIp } from "../../lib/rate-limit";

async function requestResetAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  const ip = getClientIp(await headers());
  const rateCheck = checkRateLimit(`forgot-password:${ip ?? "unknown"}`, 5, 60 * 60 * 1000);
  if (!rateCheck.allowed) redirect("/forgot-password?error=rate_limited");

  if (email) {
    // Deliberately does nothing different when the email doesn't match an account --
    // the confirmation copy below is identical either way, so this endpoint can't be
    // used to enumerate which emails have an account.
    const user = await userService.findUserByEmail(email);
    if (user) {
      const token = await userService.createPasswordResetToken(user.id);
      const appOrigin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      await getEmailProvider().sendEmail({
        to: user.email,
        subject: "Reset your password",
        text: `Reset your password: ${appOrigin}/reset-password?token=${token}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
      });
    }
  }

  redirect("/forgot-password?sent=1");
}

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "Too many attempts -- please try again in a bit.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold text-ink">Reset your password</h1>
      <p className="mb-6 text-sm text-ink-secondary">Enter your email and we&rsquo;ll send you a reset link.</p>
      {sp.error && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          {ERROR_MESSAGES[sp.error] ?? "Something went wrong."}
        </p>
      )}
      {sp.sent ? (
        <Card>
          <p className="text-sm text-ink-secondary">
            If an account exists for that email, we&rsquo;ve sent a link to reset your password. Check your inbox.
          </p>
        </Card>
      ) : (
        <Card>
          <form action={requestResetAction} className="flex flex-col gap-3">
            <label className="text-sm font-medium text-ink-secondary">
              Email
              <Input name="email" type="email" required className="mt-1 block w-full" />
            </label>
            <SubmitButton pendingLabel="Sending...">Send reset link</SubmitButton>
          </form>
        </Card>
      )}
      <p className="mt-4 text-sm text-ink-secondary">
        <a href="/login" className="text-accent hover:underline">
          Back to sign in
        </a>
      </p>
    </main>
  );
}
