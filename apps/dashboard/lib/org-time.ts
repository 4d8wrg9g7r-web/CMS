import { DEFAULT_TIMEZONE } from "@cms/database";
import { getCurrentOrganization } from "./session";

/**
 * The signed-in staff request's display timezone (UX audit #1): the org's
 * setting, UTC until one is chosen. Public surfaces resolve the org
 * themselves and use organizationService.getOrganizationTimezone instead.
 */
export async function getOrgTimeZone(): Promise<string> {
  const organization = await getCurrentOrganization();
  return organization?.timezone ?? DEFAULT_TIMEZONE;
}

/** Hour-of-day (0-23) in a zone — for greetings, not arithmetic. */
export function hourInTimeZone(date: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false, hourCycle: "h23" }).format(date),
  );
}
