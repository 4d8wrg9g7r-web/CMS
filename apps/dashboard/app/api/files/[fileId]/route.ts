import { NextRequest, NextResponse } from "next/server";
import { auditService, fileService } from "@cms/database";
import { getPrivateStorageProvider } from "@cms/storage";
import { getCurrentOrganization, getCurrentUser } from "../../../../lib/session";
import { canFiles } from "../../../../lib/files-access";

export const runtime = "nodejs";

/**
 * Authorized download for private files (BLUEPRINT §41): EVERY request re-checks the
 * session, tenant scope, and the file permission before streaming bytes -- object
 * URLs/keys are never authorization (§32). Downloads are data-access audited (§47).
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canFiles(organization.id, "file.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { fileId } = await context.params;
  const file = await fileService.getFile(organization.id, fileId);
  if (!file || file.archivedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bytes = await getPrivateStorageProvider().get(file.storageKey);
  if (!bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "file.downloaded",
    targetType: "File",
    targetId: file.id,
    metadata: { fileName: file.fileName },
  });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
