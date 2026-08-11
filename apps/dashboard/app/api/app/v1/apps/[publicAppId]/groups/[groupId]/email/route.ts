import { NextResponse } from "next/server";
import { after } from "next/server";
import { groupSpaceService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../../lib/app-api-auth";
import { drainOutbox } from "../../../../../../../../../lib/outbox-worker";

export const runtime = "nodejs";

/** Leader emails the whole group through the blast pipeline (consent-checked, logged). */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string; groupId: string }> }) {
  const { publicAppId, groupId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await groupSpaceService.requireLeader(resolved.app.organizationId, groupId, resolved.member.personId);
    const json = (await req.json()) as { subject?: unknown; body?: unknown };
    const result = await groupSpaceService.emailGroup(resolved.app.organizationId, groupId, {
      subject: typeof json.subject === "string" ? json.subject : "",
      body: typeof json.body === "string" ? json.body : "",
    });
    after(async () => {
      try {
        await drainOutbox();
      } catch (err) {
        console.error("Opportunistic outbox drain failed (cron will retry):", err);
      }
    });
    return NextResponse.json(
      { ok: true, recipient_count: result.recipientCount },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "invalid", message: err instanceof Error ? err.message : "Could not send" },
      { status: 400 },
    );
  }
}
