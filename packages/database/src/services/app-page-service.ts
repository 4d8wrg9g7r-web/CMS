import { Prisma } from "@prisma/client";
import { tenantDb } from "../client";
import { validateAppPageBlocks, type AppPageBlock } from "../app/page-blocks";

/**
 * Custom app pages service (docs/domain/app.md): church-designed screens
 * referenced by `page` tabs. Blocks are validated on save AND on read — a page
 * whose stored blocks no longer validate simply yields no blocks rather than
 * breaking the app.
 */

export async function listPages(organizationId: string, opts: { includeArchived?: boolean } = {}) {
  return tenantDb.appPage.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: "asc" },
  });
}

export async function createPage(organizationId: string, input: { title: string; blocks: unknown }) {
  const title = input.title.trim();
  if (!title || title.length > 40) throw new Error("Give the page a short title (max 40 characters).");
  const validated = validateAppPageBlocks(input.blocks);
  if (!validated.ok) throw new Error(validated.error);
  return tenantDb.appPage.create({
    data: { organizationId, title, blocks: validated.blocks as unknown as Prisma.InputJsonValue },
  });
}

export async function updatePage(organizationId: string, pageId: string, input: { title: string; blocks: unknown }) {
  const title = input.title.trim();
  if (!title || title.length > 40) throw new Error("Give the page a short title (max 40 characters).");
  const validated = validateAppPageBlocks(input.blocks);
  if (!validated.ok) throw new Error(validated.error);
  const result = await tenantDb.appPage.updateMany({
    where: { id: pageId, organizationId },
    data: { title, blocks: validated.blocks as unknown as Prisma.InputJsonValue },
  });
  return result.count > 0;
}

export async function archivePage(organizationId: string, pageId: string) {
  const result = await tenantDb.appPage.updateMany({
    where: { id: pageId, organizationId },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

export interface ActivePage {
  id: string;
  title: string;
  blocks: AppPageBlock[];
}

/** Active pages with re-validated blocks — the shape the app renders. */
export async function listActivePages(organizationId: string): Promise<ActivePage[]> {
  const pages = await listPages(organizationId);
  return pages.map((page) => {
    const validated = validateAppPageBlocks(page.blocks);
    return { id: page.id, title: page.title, blocks: validated.ok ? validated.blocks : [] };
  });
}
