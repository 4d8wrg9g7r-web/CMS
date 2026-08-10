import { tenantDb } from "../client";
import { buildStorageKey } from "../files/helpers";

/**
 * File metadata service (BLUEPRINT §41). Bytes live in the PrivateStorageProvider (app
 * layer writes them); this service owns metadata, tenant ownership, and the key
 * convention. Soft archive preserves the record; byte deletion is a retention-policy
 * decision deferred with §49.
 */

export async function createFileRecord(
  organizationId: string,
  input: {
    fileName: string;
    contentType: string;
    sizeBytes: number;
    relatedPersonId?: string | null;
    uploadedByUserId?: string | null;
  },
) {
  if (input.relatedPersonId) {
    const person = await tenantDb.person.findFirst({
      where: { id: input.relatedPersonId, organizationId },
      select: { id: true },
    });
    if (!person) throw new Error("Person not found.");
  }
  const storageKey = buildStorageKey(organizationId, crypto.randomUUID(), input.fileName);
  return tenantDb.file.create({
    data: {
      organizationId,
      fileName: input.fileName.slice(0, 200),
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      storageKey,
      relatedPersonId: input.relatedPersonId ?? null,
      uploadedByUserId: input.uploadedByUserId ?? null,
    },
  });
}

export async function getFile(organizationId: string, fileId: string) {
  return tenantDb.file.findFirst({ where: { id: fileId, organizationId } });
}

export async function listFilesForPerson(organizationId: string, personId: string) {
  return tenantDb.file.findMany({
    where: { organizationId, relatedPersonId: personId, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function archiveFile(organizationId: string, fileId: string) {
  const result = await tenantDb.file.updateMany({
    where: { id: fileId, organizationId },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}
