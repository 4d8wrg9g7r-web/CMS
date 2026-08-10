/**
 * Pure Files-domain helpers — no Prisma access, unit-tested without a database.
 */

/**
 * Sanitize a user-supplied file name for use inside a storage key: strip any path
 * components, keep [A-Za-z0-9._-], collapse everything else, cap length. Never trusted
 * as a path (§41) — the private storage provider re-validates the full key anyway.
 */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.\-]+/, "")
    .slice(0, 80);
  return cleaned || "file";
}

/** Tenant-prefixed private storage key: `<orgId>/<unique>-<sanitized-name>`. */
export function buildStorageKey(organizationId: string, unique: string, fileName: string): string {
  return `${organizationId}/${unique}-${sanitizeFileName(fileName)}`;
}
