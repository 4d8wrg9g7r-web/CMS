import { tenantDb } from "../client";

/**
 * Media collections (docs/domain/app.md): "event" and "sermon" hold graphics
 * managed right on those modules' pages; "library" is the general Files area
 * for anything staff want a hosted link to. Files live in public storage;
 * graphics attach to items by URL via Event.imageUrl / Sermon.artworkUrl, so
 * deleting an asset never breaks an item silently (the item keeps its URL).
 */

export const MEDIA_COLLECTIONS = ["event", "sermon", "library"] as const;
export type MediaCollection = (typeof MEDIA_COLLECTIONS)[number];

export function isMediaCollection(value: unknown): value is MediaCollection {
  return typeof value === "string" && (MEDIA_COLLECTIONS as readonly string[]).includes(value);
}

export async function listMediaAssets(
  organizationId: string,
  opts: { collection?: MediaCollection; q?: string } = {},
) {
  return tenantDb.mediaAsset.findMany({
    where: {
      organizationId,
      ...(opts.collection ? { collection: opts.collection } : {}),
      ...(opts.q ? { name: { contains: opts.q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createMediaAsset(
  organizationId: string,
  input: { collection: MediaCollection; name: string; url: string; contentType: string; sizeBytes: number },
) {
  const name = input.name.trim().slice(0, 160) || "Untitled";
  return tenantDb.mediaAsset.create({
    data: { organizationId, ...input, name },
  });
}

export async function getMediaAsset(organizationId: string, assetId: string) {
  return tenantDb.mediaAsset.findFirst({ where: { id: assetId, organizationId } });
}

export async function deleteMediaAsset(organizationId: string, assetId: string) {
  const result = await tenantDb.mediaAsset.deleteMany({ where: { id: assetId, organizationId } });
  return result.count > 0;
}
