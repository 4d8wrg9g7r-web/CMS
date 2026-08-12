"use server";

import { searchService, type GlobalSearchResults } from "@cms/database";
import { getCurrentOrganization } from "../../lib/session";
import { canPeople } from "../../lib/people-access";
import { canGiving } from "../../lib/giving-access";
import { canGroups } from "../../lib/groups-access";

/**
 * Global search behind the command palette. Entity types the current role
 * can't view are never queried — a finance-only role doesn't see people
 * results, and vice versa. Navigation/action entries live client-side in the
 * palette (destinations aren't secrets; every page enforces its own authz).
 */
export async function globalSearchAction(query: string): Promise<GlobalSearchResults | null> {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [people, groups, giving] = await Promise.all([
    canPeople(organization.id, "person.view"),
    canGroups(organization.id, "group.view"),
    canGiving(organization.id, "giving.view"),
  ]);

  return searchService.globalSearch(organization.id, query, {
    people,
    groups,
    events: true,
    forms: true,
    sermons: true,
    campaigns: giving,
    reports: true,
  });
}
