/** Pure campaign math (docs/domain/giving.md "Pledge campaigns") — unit-tested. */

export const MIN_PLEDGE_CENTS = 100;
export const MAX_PLEDGE_CENTS = 100_000_000; // $1M — sanity bound, not policy

export function pledgeAmountError(amountCents: unknown): string | null {
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents)) return "Enter a valid pledge amount.";
  if (amountCents < MIN_PLEDGE_CENTS) return "The minimum pledge is $1.";
  if (amountCents > MAX_PLEDGE_CENTS) return "That pledge is above the online limit — contact your church office.";
  return null;
}

/** Progress percent for thermometers: 0–100, whole numbers, never NaN. */
export function campaignPercent(raisedCents: number, goalCents: number): number {
  if (goalCents <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((raisedCents / goalCents) * 100)));
}

/** A campaign is live when started, not ended, not archived. */
export function campaignIsActive(
  campaign: { startsAt: Date; endsAt: Date | null; archivedAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (campaign.archivedAt) return false;
  if (campaign.startsAt > now) return false;
  if (campaign.endsAt && campaign.endsAt < now) return false;
  return true;
}
