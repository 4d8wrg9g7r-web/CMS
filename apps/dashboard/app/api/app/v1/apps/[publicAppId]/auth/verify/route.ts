import { NextResponse } from "next/server";
import { appMemberService, appService } from "@cms/database";
import { memberJson } from "../../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/** Native sign-in step 2: code in, Bearer token out (same AppSession as the web cookie). */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let email = "";
  let code = "";
  try {
    const body = (await req.json()) as { email?: unknown; code?: unknown };
    email = typeof body.email === "string" ? body.email.trim() : "";
    code = typeof body.code === "string" ? body.code.trim() : "";
  } catch {
    /* fall through */
  }
  if (!email || !code) return NextResponse.json({ error: "email_and_code_required" }, { status: 400 });

  const result = await appMemberService.verifyLoginCode(app.organizationId, email, code);
  if (!result.ok) {
    return NextResponse.json({ error: "invalid_code", message: result.error }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const member = await appMemberService.getSessionMember(app.organizationId, result.token);
  return NextResponse.json(
    { token: result.token, member: member ? memberJson(member) : null },
    { headers: { "cache-control": "no-store" } },
  );
}
