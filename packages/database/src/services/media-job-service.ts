import { tenantDb } from "../client";

/**
 * Queue for the self-hosted media worker (workers/media-worker): ffmpeg work
 * that can't run on serverless, e.g. extracting a sermon's audio track from an
 * uploaded video. The dashboard only enqueues and reads status — the worker
 * claims rows over plain SQL (SKIP LOCKED) from wherever the church hosts it.
 */

export const MEDIA_JOB_KINDS = ["EXTRACT_AUDIO"] as const;

/** One pending/running job per sermon+kind — re-enqueueing resets a failure. */
export async function queueMediaJob(
  organizationId: string,
  input: { sermonId: string; kind: (typeof MEDIA_JOB_KINDS)[number]; sourceUrl: string },
) {
  const existing = await tenantDb.mediaJob.findFirst({
    where: { organizationId, sermonId: input.sermonId, kind: input.kind, status: { in: ["PENDING", "RUNNING"] } },
  });
  if (existing) return existing;
  return tenantDb.mediaJob.create({
    data: { organizationId, sermonId: input.sermonId, kind: input.kind, sourceUrl: input.sourceUrl },
  });
}

export async function latestJobForSermon(organizationId: string, sermonId: string) {
  return tenantDb.mediaJob.findFirst({
    where: { organizationId, sermonId },
    orderBy: { createdAt: "desc" },
  });
}

export async function cancelJobsForSermon(organizationId: string, sermonId: string) {
  await tenantDb.mediaJob.deleteMany({ where: { organizationId, sermonId, status: "PENDING" } });
}
