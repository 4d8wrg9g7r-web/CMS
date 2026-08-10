"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditService, journeyService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireJourneys } from "../../../lib/journeys-access";

/**
 * Journeys server actions. Authorization enforced server-side via requireJourneys
 * (BLUEPRINT §34); every mutation records an audit event (§47).
 */

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function requireOrg() {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  return organization;
}

async function audit(organizationId: string, action: string, targetId: string, metadata?: Record<string, unknown>) {
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId,
    actorUserId: actor?.id,
    action,
    targetType: "JourneyDefinition",
    targetId,
    metadata,
  });
}

export async function createJourneyAction(formData: FormData) {
  const organization = await requireOrg();
  await requireJourneys(organization.id, "journey.manage");

  const name = str(formData, "name");
  if (!name) throw new Error("Journey name is required.");

  const journey = await journeyService.createJourney(organization.id, {
    name,
    description: str(formData, "description") || null,
  });
  await audit(organization.id, "journey.created", journey.id, { name });
  redirect(`/journeys/${journey.id}`);
}

export async function updateJourneyAction(journeyId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireJourneys(organization.id, "journey.manage");

  const name = str(formData, "name");
  if (!name) throw new Error("Journey name is required.");

  await journeyService.updateJourney(organization.id, journeyId, {
    name,
    description: str(formData, "description") || null,
    isActive: formData.get("isActive") === "on",
  });
  await audit(organization.id, "journey.updated", journeyId);
  revalidatePath(`/journeys/${journeyId}`);
}

export async function archiveJourneyAction(journeyId: string) {
  const organization = await requireOrg();
  await requireJourneys(organization.id, "journey.manage");
  await journeyService.archiveJourney(organization.id, journeyId);
  await audit(organization.id, "journey.archived", journeyId);
  revalidatePath(`/journeys/${journeyId}`);
  revalidatePath("/journeys");
}

export async function restoreJourneyAction(journeyId: string) {
  const organization = await requireOrg();
  await requireJourneys(organization.id, "journey.manage");
  await journeyService.restoreJourney(organization.id, journeyId);
  await audit(organization.id, "journey.restored", journeyId);
  revalidatePath(`/journeys/${journeyId}`);
  revalidatePath("/journeys");
}

export async function addMilestoneAction(journeyId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireJourneys(organization.id, "journey.manage");

  const name = str(formData, "name");
  if (!name) throw new Error("Milestone name is required.");
  const targetDaysRaw = Number.parseInt(str(formData, "targetDays"), 10);

  const milestone = await journeyService.addMilestone(organization.id, journeyId, {
    name,
    description: str(formData, "description") || null,
    targetDays: Number.isFinite(targetDaysRaw) && targetDaysRaw > 0 ? targetDaysRaw : null,
  });
  await audit(organization.id, "journey.milestone_added", journeyId, { milestoneId: milestone.id, name });
  revalidatePath(`/journeys/${journeyId}`);
}

export async function removeMilestoneAction(journeyId: string, milestoneId: string) {
  const organization = await requireOrg();
  await requireJourneys(organization.id, "journey.manage");
  await journeyService.removeMilestone(organization.id, milestoneId);
  await audit(organization.id, "journey.milestone_removed", journeyId, { milestoneId });
  revalidatePath(`/journeys/${journeyId}`);
}

export async function moveMilestoneAction(journeyId: string, milestoneId: string, direction: "up" | "down") {
  const organization = await requireOrg();
  await requireJourneys(organization.id, "journey.manage");
  await journeyService.moveMilestone(organization.id, milestoneId, direction);
  await audit(organization.id, "journey.milestone_reordered", journeyId, { milestoneId, direction });
  revalidatePath(`/journeys/${journeyId}`);
}

export async function enrollPersonAction(journeyId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireJourneys(organization.id, "journey.manage");

  const personId = str(formData, "personId");
  if (!personId) throw new Error("Choose a person to enroll.");

  const actor = await getCurrentUser();
  const result = await journeyService.enroll(organization.id, journeyId, personId, {
    enrolledByUserId: actor?.id ?? null,
  });
  if (!result.ok) {
    throw new Error(result.reason === "inactive" ? "This journey is closed to new enrollment." : "Journey or person not found.");
  }
  if (!result.alreadyEnrolled) {
    await audit(organization.id, "journey.person_enrolled", journeyId, { personId });
  }
  revalidatePath(`/journeys/${journeyId}`);
  revalidatePath(`/people/${personId}`);
}

export async function completeMilestoneAction(
  journeyId: string,
  enrollmentId: string,
  milestoneId: string,
  personId: string,
) {
  const organization = await requireOrg();
  await requireJourneys(organization.id, "journey.manage");

  const actor = await getCurrentUser();
  const result = await journeyService.completeMilestone(organization.id, enrollmentId, milestoneId, actor?.id);
  if (result.ok) {
    await audit(organization.id, "journey.milestone_completed", journeyId, { enrollmentId, milestoneId });
    if (result.journeyCompleted) {
      await audit(organization.id, "journey.completed", journeyId, { enrollmentId });
    }
  }
  revalidatePath(`/journeys/${journeyId}`);
  revalidatePath(`/people/${personId}`);
}

export async function uncompleteMilestoneAction(
  journeyId: string,
  enrollmentId: string,
  milestoneId: string,
  personId: string,
) {
  const organization = await requireOrg();
  await requireJourneys(organization.id, "journey.manage");
  await journeyService.uncompleteMilestone(organization.id, enrollmentId, milestoneId);
  await audit(organization.id, "journey.milestone_uncompleted", journeyId, { enrollmentId, milestoneId });
  revalidatePath(`/journeys/${journeyId}`);
  revalidatePath(`/people/${personId}`);
}

export async function exitEnrollmentAction(journeyId: string, enrollmentId: string, personId: string) {
  const organization = await requireOrg();
  await requireJourneys(organization.id, "journey.manage");
  await journeyService.exitEnrollment(organization.id, enrollmentId);
  await audit(organization.id, "journey.enrollment_exited", journeyId, { enrollmentId });
  revalidatePath(`/journeys/${journeyId}`);
  revalidatePath(`/people/${personId}`);
}

export async function reactivateEnrollmentAction(journeyId: string, enrollmentId: string, personId: string) {
  const organization = await requireOrg();
  await requireJourneys(organization.id, "journey.manage");
  await journeyService.reactivateEnrollment(organization.id, enrollmentId);
  await audit(organization.id, "journey.enrollment_reactivated", journeyId, { enrollmentId });
  revalidatePath(`/journeys/${journeyId}`);
  revalidatePath(`/people/${personId}`);
}
