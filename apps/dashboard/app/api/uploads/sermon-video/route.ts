import path from "node:path";
import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getStorageProvider } from "@cms/storage";
import { canApp } from "../../../../lib/app-access";
import { getCurrentOrganization } from "../../../../lib/session";

export const runtime = "nodejs";

/** 4 GB — a 60–90 minute service at typical bitrates, with headroom. */
const VIDEO_MAX_BYTES = 4 * 1024 * 1024 * 1024;
const VIDEO_CONTENT_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];

/**
 * Sermon video upload (docs/domain/app.md "Self-hosted media"). Production:
 * the browser uploads STRAIGHT to the org's Blob storage via the client-upload
 * token flow — the file never passes through a serverless function, so there
 * is no request-size ceiling. Local dev (no BLOB_READ_WRITE_TOKEN): the
 * ?dev=1 branch accepts the file body directly and writes via local storage.
 */
/** Mode probe: the client asks whether to use the Blob token flow or dev POST. */
export async function GET() {
  const organization = await getCurrentOrganization();
  if (!organization || !(await canApp(organization.id, "sermon.manage"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ mode: process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "direct" });
}

export async function POST(req: Request) {
  const organization = await getCurrentOrganization();
  if (!organization || !(await canApp(organization.id, "sermon.manage"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (url.searchParams.get("dev") !== "1") {
      return NextResponse.json({ mode: "direct" }, { status: 409 });
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "no_file" }, { status: 400 });
    if (!VIDEO_CONTENT_TYPES.includes(file.type)) return NextResponse.json({ error: "bad_type" }, { status: 400 });
    const saved = await getStorageProvider(path.join(process.cwd(), "public")).saveFile({
      organizationId: organization.id,
      fileName: file.name,
      contentType: file.type,
      data: Buffer.from(await file.arrayBuffer()),
    });
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const absolute = saved.url.startsWith("/") ? `${proto}://${host}${saved.url}` : saved.url;
    return NextResponse.json({ url: absolute });
  }

  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: VIDEO_CONTENT_TYPES,
        maximumSizeInBytes: VIDEO_MAX_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ organizationId: organization.id }),
      }),
      // Completion is confirmed client-side via attachSermonVideoAction, which
      // re-checks permissions; nothing to do server-to-server here.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "upload_failed" }, { status: 400 });
  }
}
