"use server";

import { revalidatePath } from "next/cache";
import { auditService, fileService } from "@cms/database";
import { getPrivateStorageProvider } from "@cms/storage";
import { getCurrentOrganization, getCurrentUser } from "../../../../lib/session";
import { requireFiles } from "../../../../lib/files-access";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB inline cap; signed uploads later (§41).

/**
 * Upload a private file attached to a Person. Metadata first (which mints the
 * tenant-prefixed storage key), then bytes into the PrivateStorageProvider. Audited.
 */
export async function uploadPersonFileAction(personId: string, formData: FormData) {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  await requireFiles(organization.id, "file.manage");

  const upload = formData.get("file");
  if (!(upload instanceof File) || upload.size === 0) throw new Error("Choose a file to upload.");
  if (upload.size > MAX_UPLOAD_BYTES) throw new Error("Files are limited to 10 MB.");

  const actor = await getCurrentUser();
  const record = await fileService.createFileRecord(organization.id, {
    fileName: upload.name || "file",
    contentType: upload.type || "application/octet-stream",
    sizeBytes: upload.size,
    relatedPersonId: personId,
    uploadedByUserId: actor?.id ?? null,
  });

  const bytes = Buffer.from(await upload.arrayBuffer());
  await getPrivateStorageProvider().put(record.storageKey, bytes);

  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "file.uploaded",
    targetType: "File",
    targetId: record.id,
    metadata: { fileName: record.fileName, personId, sizeBytes: record.sizeBytes },
  });

  revalidatePath(`/people/${personId}`);
}

export async function archivePersonFileAction(personId: string, fileId: string) {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  await requireFiles(organization.id, "file.manage");

  await fileService.archiveFile(organization.id, fileId);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "file.archived",
    targetType: "File",
    targetId: fileId,
    metadata: { personId },
  });

  revalidatePath(`/people/${personId}`);
}
