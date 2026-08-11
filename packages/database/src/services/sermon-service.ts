import { tenantDb } from "../client";

/**
 * Sermon library service (docs/domain/app.md). v1 stores metadata plus an
 * external video/audio URL — no media bytes. Soft archival keeps history;
 * the public app lists non-archived sermons newest-first.
 */

export interface SermonInput {
  title: string;
  speaker?: string | null;
  series?: string | null;
  passage?: string | null;
  description?: string | null;
  videoUrl?: string | null;
  preachedAt: Date;
}

const HTTP_URL = /^https?:\/\/[^\s"'<>]+$/i;

function clean(input: SermonInput) {
  const title = input.title.trim();
  if (!title) throw new Error("The sermon needs a title.");
  const videoUrl = input.videoUrl?.trim() || null;
  if (videoUrl && !HTTP_URL.test(videoUrl)) throw new Error("The video link must be an http(s) URL.");
  return {
    title,
    speaker: input.speaker?.trim() || null,
    series: input.series?.trim() || null,
    passage: input.passage?.trim() || null,
    description: input.description?.trim() || null,
    videoUrl,
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
