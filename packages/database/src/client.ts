import { PrismaClient } from "@prisma/client";
import { withTenantGuard } from "./tenant-guard";

declare global {
  // eslint-disable-next-line no-var
  var __cmsPrisma: PrismaClient | undefined;
}

function createRawClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Reuse a single PrismaClient across hot reloads in dev (Next.js).
const rawPrisma = globalThis.__cmsPrisma ?? createRawClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__cmsPrisma = rawPrisma;
}

/**
 * Tenant-guarded client. This is what the service layer (src/services/*) uses for
 * every query against an organization-owned model. Never import `rawPrisma` outside
 * of auth (which queries User by email/id, a non-tenant-owned model) and this file.
 */
export const tenantDb = withTenantGuard(rawPrisma);

/**
 * Raw, unguarded client — only for models that are NOT organization-owned
 * (User) and for the seed script. Do not use for tenant-scoped models.
 */
export const rawDb = rawPrisma;

export * from "@prisma/client";
