import path from "node:path";
import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getStorageProvider } from "@cms/storage";
import { isMediaCollection, type MediaCollection } from "@cms/database";
import { canApp } from "../../../../lib/app-access";
import { canEvents } from "../../../../lib/events-access";
import { getCurrentOrganization } from "../../../../lib/session";
import {
  mediaContentTypesFor,
  mediaMaxBytesFor,
} from "../../../../lib/media-rules";

export const runtime = "nodejs";

/**
 * Media/Files upload (graphics + the general Files library). Same shape as
 * the sermon-video route: in production the browser uploads STRAIGHT to Blob
 * storage via the client-upload token flow — Vercel caps serverless request
 * bodies at ~4.5 MB, so files above that can never ride through a server
 * action. Local dev (no BLOB_READ_WRITE_TOKEN) accepts the file body directly
 * and writes via local storage.
 */
async function canManageCollection(organizationId: string, collection: MediaCollection): Promise<boolean> {
  if (collection === "event") return canEvents(organizationId, "event.manage");
  if (collection === "sermon") return canApp(organizationId, "sermon.manage");
  return canApp(organizationId, "app.manage");
}

function collectionFrom(req: Request): MediaCollection | null {
  const raw = new URL(req.url).searchParams.get("collection");
  return isMediaCollection(raw) ? raw : null;
}

/** Mode probe: the client asks whether to use the Blob token flow or dev POST. */
export async function GET(req: Request) {
  const collection = collectionFrom(req);
  if (!collection) return NextResponse.json({ error: "bad_collection" }, { status: 400 });
  const organization = await getCurrentOrganization();
  if (!organization || !(await canManageCollection(organization.id, collection))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ mode: process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "direct" });
}

export async function POST(req: Request) {
  const collection = collectionFrom(req);
  if (!collection) return NextResponse.json({ error: "bad_collection" }, { status: 400 });
  const organization = await getCurrentOrganization();
  if (!organization || !(await canManageCollection(organization.id, collection))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const allowedTypes = mediaContentTypesFor(collection);
  const maxBytes = mediaMaxBytesFor(collection);

  const url = new URL(req.url);
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (url.searchParams.get("dev") !== "1") {
      return NextResponse.json({ mode: "direct" }, { status: 409 });
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "no_file" }, { status: 400 });
    if (!allowedTypes.includes(file.type)) return NextResponse.json({ error: "bad_type" }, { status: 400 });
    if (file.size > maxBytes) return NextResponse.json({ error: "too_large" }, { status: 400 });
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
        allowedContentTypes: allowedTypes,
        maximumSizeInBytes: maxBytes,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ organizationId: organization.id, collection }),
      }),
      // Completion is confirmed client-side via registerMediaAssetAction,
      // which re-checks permissions; nothing to do server-to-server here.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "upload_failed" }, { status: 400 });
  }
}
