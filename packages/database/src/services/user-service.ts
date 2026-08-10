import { rawDb } from "../client";

// User is not organization-scoped at the model level (see OrganizationMember for the
// one-org-per-account rule), so these queries intentionally use rawDb rather than the
// tenant-guarded client.

const RESET_TOKEN_BYTES = 32;

/**
 * Uses the Web Crypto API (a global in Node 19+, also available in Next.js's Edge
 * runtime) rather than node:crypto -- this file is reachable from middleware.ts's
 * Edge-bundled auth.ts via @cms/database's barrel export, and node:crypto imports
 * fail that bundle (same constraint as developer/helpers.ts's key generation).
 */
function generateToken(): string {
  const bytes = new Uint8Array(RESET_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function findUserByEmail(email: string) {
  return rawDb.user.findUnique({ where: { email: email.toLowerCase() } });
}

export async function createUser(params: { email: string; name?: string; passwordHash: string }) {
  return rawDb.user.create({
    data: { email: params.email.toLowerCase(), name: params.name, passwordHash: params.passwordHash },
  });
}

export async function getUser(userId: string) {
  return rawDb.user.findUnique({ where: { id: userId } });
}

export async function updatePassword(userId: string, passwordHash: string) {
  return rawDb.user.update({ where: { id: userId }, data: { passwordHash } });
}

export async function updateUser(userId: string, params: { name: string | null; email: string }) {
  const email = params.email.toLowerCase();
  const existing = await rawDb.user.findUnique({ where: { email } });
  if (existing && existing.id !== userId) {
    throw new Error("That email address is already in use.");
  }
  return rawDb.user.update({ where: { id: userId }, data: { name: params.name, email } });
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Deletes any prior unused token for this user before issuing a new one -- at most
 * one valid reset link exists at a time, so an old email a user finds later can't
 * still be used after they've already requested (or completed) a newer reset.
 */
export async function createPasswordResetToken(userId: string) {
  await rawDb.passwordResetToken.deleteMany({ where: { userId } });
  const token = generateToken();
  await rawDb.passwordResetToken.create({
    data: { userId, token, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });
  return token;
}

export async function getValidPasswordResetToken(token: string) {
  const record = await rawDb.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.expiresAt <= new Date()) return null;
  return record;
}

export async function deletePasswordResetToken(token: string) {
  return rawDb.passwordResetToken.deleteMany({ where: { token } });
}
