import { Prisma } from "@prisma/client";
import { rawDb, tenantDb } from "../client";

/**
 * Sermon library service (docs/domain/app.md). Stores metadata plus external
 * video links, an optional direct audio file, custom links, artwork, and
 * attached documents (notes/handouts — public storage URLs). Soft archival
 * keeps history; the public app lists non-archived sermons newest-first.
 */

export interface SermonLink {
  label: string;
  url: string;
}

export interface SermonInput {
  title: string;
  speaker?: string | null;
  series?: string | null;
  passage?: string | null;
  description?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  artworkUrl?: string | null;
  links?: unknown;
  preachedAt: Date;
}

const HTTP_URL = /^https?:\/\/[^\s"'<>]+$/i;

export const MAX_SERMON_LINKS = 10;

/**
 * Coerce untrusted JSON into a well-formed links list: http(s) URLs only,
 * labels required, capped. Anything malformed is dropped rather than thrown —
 * stored data is re-parsed on read so bad rows can't take a page down.
 */
export function parseSermonLinks(raw: unknown): SermonLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      label: typeof l.label === "string" ? l.label.trim().slice(0, 80) : "",
      url: typeof l.url === "string" ? l.url.trim().slice(0, 1000) : "",
    }))
    .filter((l) => l.label.length > 0 && HTTP_URL.test(l.url))
    .slice(0, MAX_SERMON_LINKS);
}

function clean(input: SermonInput) {
  const title = input.title.trim();
  if (!title) throw new Error("The sermon needs a title.");
  const videoUrl = input.videoUrl?.trim() || null;
  if (videoUrl && !HTTP_URL.test(videoUrl)) throw new Error("The video link must be an http(s) URL.");
  const audioUrl = input.audioUrl?.trim() || null;
  if (audioUrl && !HTTP_URL.test(audioUrl)) throw new Error("The audio link must be an http(s) URL.");
  const artworkUrl = input.artworkUrl?.trim() || null;
  if (artworkUrl && !HTTP_URL.test(artworkUrl)) throw new Error("The artwork link must be an http(s) URL.");
  return {
    title,
    speaker: input.speaker?.trim() || null,
    series: input.series?.trim() || null,
    passage: input.passage?.trim() || null,
    description: input.description?.trim() || null,
    videoUrl,
    audioUrl,
    artworkUrl,
    links: parseSermonLinks(input.links) as unknown as Prisma.InputJsonValue,
    preachedAt: input.preachedAt,
  };
}

export async function listSermons(organizationId: string, opts: { includeArchived?: boolean; take?: number } = {}) {
  return tenantDb.sermon.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { preachedAt: "desc" },
    take: opts.take,
  });
}

export async function getSermon(organizationId: string, sermonId: string) {
  return tenantDb.sermon.findFirst({
    where: { id: sermonId, organizationId },
    include: { documents: { orderBy: { createdAt: "asc" } } },
  });
}

/** Public share/embed page lookup — active sermons only, by unguessable id. */
// Public resolution by unguessable publicId — the documented rawDb
// bootstrapping exception, same as site/churchApp/forms.
export async function getSermonByPublicId(publicId: string) {
  return rawDb.sermon.findFirst({
    where: { publicId, archivedAt: null },
    include: { documents: { orderBy: { createdAt: "asc" } }, organization: { select: { id: true, name: true } } },
  });
}

export async function createSermon(organizationId: string, input: SermonInput) {
  return tenantDb.sermon.create({ data: { organizationId, ...clean(input) } });
}

export async function updateSermon(organizationId: string, sermonId: string, input: SermonInput) {
  const result = await tenantDb.sermon.updateMany({
    where: { id: sermonId, organizationId },
    data: clean(input),
  });
  return result.count > 0;
}

export async function archiveSermon(organizationId: string, sermonId: string) {
  const result = await tenantDb.sermon.updateMany({
    where: { id: sermonId, organizationId },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

/** Only fields that don't go through the full edit form (uploads set these). */
export async function setSermonMedia(
  organizationId: string,
  sermonId: string,
  media: { audioUrl?: string | null; artworkUrl?: string | null }
) {
  const data: { audioUrl?: string | null; artworkUrl?: string | null } = {};
  if ("audioUrl" in media) data.audioUrl = media.audioUrl;
  if ("artworkUrl" in media) data.artworkUrl = media.artworkUrl;
  const result = await tenantDb.sermon.updateMany({ where: { id: sermonId, organizationId }, data });
  return result.count > 0;
}

export async function addSermonDocument(
  organizationId: string,
  sermonId: string,
  doc: { name: string; url: string; contentType: string; sizeBytes: number }
) {
  const sermon = await tenantDb.sermon.findFirst({ where: { id: sermonId, organizationId }, select: { id: true } });
  if (!sermon) throw new Error("Sermon not found.");
  const name = doc.name.trim().slice(0, 200);
  if (!name) throw new Error("The document needs a name.");
  if (!HTTP_URL.test(doc.url) && !doc.url.startsWith("/")) throw new Error("Bad document URL.");
  return tenantDb.sermonDocument.create({
    data: { organizationId, sermonId, name, url: doc.url, contentType: doc.contentType, sizeBytes: doc.sizeBytes },
  });
}

export async function removeSermonDocument(organizationId: string, documentId: string) {
  const result = await tenantDb.sermonDocument.deleteMany({ where: { id: documentId, organizationId } });
  return result.count > 0;
}
