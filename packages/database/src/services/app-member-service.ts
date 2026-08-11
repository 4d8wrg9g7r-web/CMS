import { createHash, randomBytes, randomInt } from "node:crypto";
import { tenantDb } from "../client";

/**
 * Member identity for the church app (docs/domain/app.md): members ARE People —
 * no separate account system. Sign-in is a 6-digit code emailed to the address
 * on their Person record, exchanged for a long-lived session token. Codes and
 * tokens are stored hashed; codes expire in 10 minutes with 5 attempts;
 * sessions last 90 days. Lookups never reveal whether an email exists — the
 * caller shows the same "check your email" either way.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function findPersonByEmail(organizationId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return tenantDb.person.findFirst({
    where: { organizationId, archivedAt: null, email: { equals: normalized, mode: "insensitive" } },
    select: { id: true, email: true, firstName: true, preferredName: true },
  });
}

export interface LoginCodeRequest {
  personId: string;
  email: string;
  firstName: string;
  /** Plain code — exists only in this return value, for the caller to email. */
  code: string;
}

/** Null when no matching person — caller must respond identically either way. */
export async function requestLoginCode(organizationId: string, email: string): Promise<LoginCodeRequest | null> {
  const person = await findPersonByEmail(organizationId, email);
  if (!person?.email) return null;

  // One live code per person: a fresh request invalidates prior ones.
  await tenantDb.appLoginCode.deleteMany({ where: { organizationId, personId: person.id } });

  const code = String(randomInt(100000, 1000000));
  await tenantDb.appLoginCode.create({
    data: {
      organizationId,
      personId: person.id,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  return { personId: person.id, email: person.email, firstName: person.preferredName || person.firstName, code };
}

export type VerifyResult = { ok: true; token: string; personId: string } | { ok: false; error: string };

export async function verifyLoginCode(organizationId: string, email: string, code: string): Promise<VerifyResult> {
  const person = await findPersonByEmail(organizationId, email);
  const generic = { ok: false as const, error: "That code didn't work. Check it and try again." };
  if (!person) return generic;

  const row = await tenantDb.appLoginCode.findFirst({
    where: { organizationId, personId: person.id },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.expiresAt < new Date() || row.attempts >= CODE_MAX_ATTEMPTS) {
    return { ok: false, error: "That code has expired — request a new one." };
  }

  if (row.codeHash !== sha256(code.trim())) {
    await tenantDb.appLoginCode.updateMany({
      where: { id: row.id, organizationId },
      data: { attempts: { increment: 1 } },
    });
    return generic;
  }

  await tenantDb.appLoginCode.deleteMany({ where: { organizationId, personId: person.id } });
  const token = randomBytes(32).toString("hex");
  await tenantDb.appSession.create({
    data: {
      organizationId,
      personId: person.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return { ok: true, token, personId: person.id };
}

export interface AppMember {
  personId: string;
  firstName: string;
  displayName: string;
}

export async function getSessionMember(organizationId: string, token: string): Promise<AppMember | null> {
  if (!token) return null;
  const session = await tenantDb.appSession.findFirst({
    where: { organizationId, tokenHash: sha256(token), expiresAt: { gt: new Date() } },
    include: { person: { select: { id: true, firstName: true, lastName: true, preferredName: true, archivedAt: true } } },
  });
  if (!session || session.person.archivedAt) return null;
  const first = session.person.preferredName || session.person.firstName;
  return { personId: session.person.id, firstName: first, displayName: `${first} ${session.person.lastName}`.trim() };
}

export async function signOut(organizationId: string, token: string): Promise<void> {
  if (!token) return;
  await tenantDb.appSession.deleteMany({ where: { organizationId, tokenHash: sha256(token) } });
}
