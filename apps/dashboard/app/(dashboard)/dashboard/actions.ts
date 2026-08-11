"use server";

import { revalidatePath } from "next/cache";
import { dashboardService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";

/**
 * Save the viewer's personal dashboard layout (card order + hidden sections).
 * Purely presentational preference — validation happens in the service via
 * validateDashboardConfig, and no permission beyond org membership is needed
 * because layout never changes what data the viewer can see.
 */
export async function saveDashboardLayoutAction(input: { config: unknown }): Promise<{ ok: boolean }> {
  const organization = await getCurrentOrganization();
  const user = await getCurrentUser();
  if (!organization || !user) return { ok: false };

  await dashboardService.saveDashboardConfig(organization.id, user.id, input.config);
  revalidatePath("/dashboard");
  return { ok: true };
}
