"use server";

import { revalidatePath } from "next/cache";
import { inboxService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";

/**
 * Resolving an inbox item is an org-wide, idempotent quieting of a derived
 * feed row — it never mutates the underlying record (the failed run, the
 * submission), so no audit event is written and nothing is lost.
 */
export async function resolveInboxItemAction(itemKey: string): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  const user = await getCurrentUser();
  await inboxService.resolveInboxItem(organization.id, itemKey, user?.id);
  revalidatePath("/inbox");
}
