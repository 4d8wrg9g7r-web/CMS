import path from "node:path";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getStorageProvider } from "@cms/storage";
import { resolveAppRequest } from "../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const PHOTO_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * Member photo upload for a feed post (native composer) — the Bearer twin of
 * the web PWA's uploadAppPhotoAction: session-gated, image-only, 4 MB cap,
 * PUBLIC storage (feed photos render for the whole congregation). Multipart
 * form with a single `file` field; returns the absolute URL to pass as
 * image_url when creating the post.
 */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!resolved.app.manifest.allowMemberPosts) {
    return NextResponse.json({ error: "posting_disabled" }, { status: 403 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const entry = form.get("file");
    file = entry instanceof File ? entry : null;
  } catch {
    /* fall through to the 400 */
  }
  if (!file || file.size === 0) return NextResponse.json({ error: "invalid", message: "Choose a photo." }, { status: 400 });
  if (!PHOTO_CONTENT_TYPES.has(file.type)) {
    return NextResponse.json({ error: "invalid", message: "Photos must be PNG, JPEG, WebP, or GIF." }, { status: 400 });
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: "invalid", message: "Photos are capped at 4 MB." }, { status: 400 });
  }

  const saved = await getStorageProvider(path.join(process.cwd(), "public")).saveFile({
    organizationId: resolved.app.organizationId,
    fileName: file.name || "photo",
    contentType: file.type,
    data: Buffer.from(await file.arrayBuffer()),
  });

  let url = saved.url;
  if (url.startsWith("/")) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return NextResponse.json({ error: "invalid", message: "Could not determine the site URL." }, { status: 500 });
    url = `${h.get("x-forwarded-proto") ?? "http"}://${host}${url}`;
  }
  return NextResponse.json({ url }, { headers: { "cache-control": "no-store" } });
}
