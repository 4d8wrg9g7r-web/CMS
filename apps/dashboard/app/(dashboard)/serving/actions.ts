"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditService, volunteerService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireVolunteers } from "../../../lib/volunteers-access";

/**
 * Volunteers server actions. Authorization enforced server-side via requireVolunteers
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

async function audit(organizationId: string, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({ organizationId, actorUserId: actor?.id, action, targetType, targetId, metadata });
}

export async function createTeamAction(formData: FormData) {
  const organization = await requireOrg();
  await requireVolunteers(organization.id, "volunteer.manage");
  const name = str(formData, "name");
  if (!name) throw new Error("Team name is required.");
  const team = await volunteerService.createTeam(organization.id, { name, description: str(formData, "description") || null });
  await audit(organization.id, "serving.team_created", "ServingTeam", team.id, { name });
  redirect(`/serving/${team.id}`);
}

export async function updateTeamAction(teamId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireVolunteers(organization.id, "volunteer.manage");
  const name = str(formData, "name");
  if (!name) throw new Error("Team name is required.");
  await volunteerService.updateTeam(organization.id, teamId, { name, description: str(formData, "description") || null });
  await audit(organization.id, "serving.team_updated", "ServingTeam", teamId);
  revalidatePath(`/serving/${teamId}`);
}

export async function archiveTeamAction(teamId: string) {
  const organization = await requireOrg();
  await requireVolunteers(organization.id, "volunteer.manage");
  await volunteerService.archiveTeam(organization.id, teamId);
  await audit(organization.id, "serving.team_archived", "ServingTeam", teamId);
  revalidatePath("/serving");
  revalidatePath(`/serving/${teamId}`);
}

export async function restoreTeamAction(teamId: string) {
  const organization = await requireOrg();
  await requireVolunteers(organization.id, "volunteer.manage");
  await volunteerService.restoreTeam(organization.id, teamId);
  await audit(organization.id, "serving.team_restored", "ServingTeam", teamId);
  revalidatePath("/serving");
  revalidatePath(`/serving/${teamId}`);
}

export async function addPositionAction(teamId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireVolunteers(organization.id, "volunteer.manage");
  const name = str(formData, "name");
  if (!name) throw new Error("Position name is required.");
  const requiredQualifications = str(formData, "requiredQualifications").split(",").map((q) => q.trim()).filter(Boolean);
  const position = await volunteerService.addPosition(organization.id, teamId, { name, requiredQualifications });
  await audit(organization.id, "serving.position_created", "ServingPosition", position.id, { name, requiredQualifications });
  revalidatePath(`/serving/${teamId}`);
}

export async function removePositionAction(teamId: string, positionId: string) {
  const organization = await requireOrg();
  await requireVolunteers(organization.id, "volunteer.manage");
  await volunteerService.removePosition(organization.id, positionId);
  await audit(organization.id, "serving.position_removed", "ServingPosition", positionId);
  revalidatePath(`/serving/${teamId}`);
}

export async function assignAction(teamId: string, positionId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireVolunteers(organization.id, "volunteer.manage");
  const personId = str(formData, "personId");
  if (!personId) throw new Error("Choose a person.");
  const result = await volunteerService.assign(organization.id, positionId, personId);
  if (!result.ok) throw new Error("Position or person not found.");
  await audit(organization.id, "serving.assigned", "ServingPosition", positionId, { personId, reactivated: result.reactivated });
  revalidatePath(`/serving/${teamId}`);
  revalidatePath(`/people/${personId}`);
}

export async function deactivateAssignmentAction(teamId: string, assignmentId: string, personId: string) {
  const organization = await requireOrg();
  await requireVolunteers(organization.id, "volunteer.manage");
  await volunteerService.deactivateAssignment(organization.id, assignmentId);
  await audit(organization.id, "serving.assignment_deactivated", "ServingAssignment", assignmentId, { personId });
  revalidatePath(`/serving/${teamId}`);
  revalidatePath(`/people/${personId}`);
}

export async function grantQualificationAction(personId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireVolunteers(organization.id, "volunteer.manage");
  const name = str(formData, "name");
  if (!name) throw new Error("Qualification name is required.");
  const expiresRaw = str(formData, "expiresAt");
  const id = await volunteerService.grantQualification(organization.id, personId, {
    name,
    expiresAt: expiresRaw ? new Date(`${expiresRaw}T23:59:59Z`) : null,
    notes: str(formData, "notes") || null,
  });
  if (!id) throw new Error("Person not found.");
  await audit(organization.id, "person.qualification_granted", "Person", personId, { name });
  revalidatePath(`/people/${personId}`);
}

export async function revokeQualificationAction(personId: string, name: string) {
  const organization = await requireOrg();
  await requireVolunteers(organization.id, "volunteer.manage");
  await volunteerService.revokeQualification(organization.id, personId, name);
  await audit(organization.id, "person.qualification_revoked", "Person", personId, { name });
  revalidatePath(`/people/${personId}`);
}
