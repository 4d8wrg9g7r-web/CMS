/**
 * Pure Volunteers-domain helpers — no Prisma access, unit-tested without a database.
 */

export interface EligibilityResult {
  eligible: boolean;
  /** Required qualification names the person does not hold at all. */
  missing: string[];
  /** Required qualification names the person holds but that have expired. */
  expired: string[];
}

/**
 * Policy-driven eligibility (BLUEPRINT §10): eligible iff every required qualification
 * name is held and unexpired at `now`. Flags, never blocks — callers surface
 * missing/expired on rosters; assignments are not auto-revoked.
 */
export function isEligible(
  required: string[],
  qualifications: { name: string; expiresAt: Date | null }[],
  now: Date = new Date(),
): EligibilityResult {
  const byName = new Map(qualifications.map((q) => [q.name, q]));
  const missing: string[] = [];
  const expired: string[] = [];

  for (const name of required) {
    const qualification = byName.get(name);
    if (!qualification) missing.push(name);
    else if (qualification.expiresAt && qualification.expiresAt.getTime() <= now.getTime()) expired.push(name);
  }

  return { eligible: missing.length === 0 && expired.length === 0, missing, expired };
}
