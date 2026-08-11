import { NextResponse } from "next/server";
import { after } from "next/server";
import { appMemberService, appService, messageService } from "@cms/database";
import { drainOutbox } from "../../../../../../../../lib/outbox-worker";

export const runtime = "nodejs";

/**
 * Native sign-in step 1: email in, 6-digit code out through the message
 * pipeline. Responds identically whether or not the email matched a person —
 * no account enumeration from the public surface. Same flow as the web PWA's
 * requestAppCodeAction, minus the cookie.
 */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim() : "";
  } catch {
    /* fall through to the 400 */
  }
  if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 });

  const request = await appMemberService.requestLoginCode(app.organizationId, email);
  if (request) {
    // Transactional (user-initiated sign-in): sent without a person link so the
    // marketing opt-out doesn't lock members out of their own app.
    await messageService.queueMessage({
      organizationId: app.organizationId,
      toEmail: request.email,
      subject: `${request.code} is your ${app.manifest.appName} sign-in code`,
      body: `Hi ${request.firstName},\n\nYour sign-in code for ${app.manifest.appName} is: ${request.code}\n\nIt expires in 10 minutes. If you didn't request this, you can ignore this email.`,
      source: "app_signin",
    });
    after(async () => {
      try {
        await drainOutbox();
      } catch (err) {
        console.error("Opportunistic outbox drain failed (cron will retry):", err);
      }
    });
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
